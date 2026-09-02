// db/queries.ts — TOUTES les requêtes SQL de lecture du socle V1, regroupées
// ici pour deux raisons :
//   1. les routes HTTP restent lisibles (aucun SQL éparpillé) ;
//   2. le cloisonnement par client se contrôle à un seul endroit (voir les
//      commentaires "CLOISONNEMENT").
//
// La V1 est en lecture seule : aucun INSERT/UPDATE/DELETE côté API, à
// l'exception des écritures internes du journal et de la synchronisation,
// qui vivent respectivement dans orchestration/ et jobs/.
//
// Montants : cast ::float8 pour recevoir des number (pg renvoie les numeric
// en string). Timestamps : pg renvoie des Date (sérialisées en ISO par JSON).

import type pg from 'pg';
import type {
  ActivityRow,
  ActivityWithContext,
  ClientRow,
  IntegrationRow,
  JournalRow,
  ProjectSummary,
  ProjectWithClient,
} from '../types.js';

async function rows<T>(pool: pg.Pool, text: string, params: unknown[] = []): Promise<T[]> {
  const result = await pool.query(text, params);
  return result.rows as T[];
}

// Échappe les caractères joker de LIKE (\ % _) dans une saisie utilisateur.
function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, (char) => `\\${char}`);
}

// Colonnes communes des projets (toutes les requêtes qui renvoient un
// projet partagent cette liste, pour un contrat stable).
const SELECT_PROJET_COLUMNS = `
  p.id, p.nom, p.statut, p.vertical,
  p.client_id, p.depot_github, p.url_production,
  p.environnements, p.notes, p.created_at,
  p.montant_contractualise::float8 as montant_contractualise,
  p.montant_facture::float8 as montant_facture,
  p.date_debut, p.date_echeance, p.date_derniere_activite`;

// ---------------------------------------------------------------------------
// CLIENTS
// ---------------------------------------------------------------------------

export interface ClientListRow extends ClientRow {
  nb_projets: number;
}

export function listClients(
  pool: pg.Pool,
  filters: { vertical?: string; statut?: string } = {}
): Promise<ClientListRow[]> {
  const conditions: string[] = [];
  const params: unknown[] = [];
  if (filters.vertical) {
    params.push(filters.vertical);
    conditions.push(`c.vertical = $${params.length}`);
  }
  if (filters.statut) {
    params.push(filters.statut);
    conditions.push(`c.statut = $${params.length}`);
  }
  const where = conditions.length > 0 ? `where ${conditions.join(' and ')}` : '';
  return rows<ClientListRow>(
    pool,
    `select c.*,
            (select count(*) from projets p where p.client_id = c.id)::int as nb_projets
     from clients c
     ${where}
     order by c.nom`,
    params
  );
}

export function getClient(pool: pg.Pool, clientId: string): Promise<ClientListRow | null> {
  return rows<ClientListRow>(
    pool,
    `select c.*,
            (select count(*) from projets p where p.client_id = c.id)::int as nb_projets
     from clients c
     where c.id = $1`,
    [clientId]
  ).then((result) => result[0] ?? null);
}

// ---------------------------------------------------------------------------
// PROJETS
// ---------------------------------------------------------------------------

export interface ProjectFilters {
  // CLOISONNEMENT : un listing de projets SANS client_id n'est autorisé que
  // par les routes globales du poste de pilotage (dashboard, recherche) —
  // l'intention explicite d'agréger. Toute liste ciblée passe par client_id.
  clientId?: string;
  statut?: string;
  vertical?: string;
}

export function listProjects(pool: pg.Pool, filters: ProjectFilters = {}): Promise<ProjectSummary[]> {
  const conditions: string[] = [];
  const params: unknown[] = [];
  if (filters.clientId) {
    params.push(filters.clientId);
    conditions.push(`p.client_id = $${params.length}`);
  }
  if (filters.statut) {
    params.push(filters.statut);
    conditions.push(`p.statut = $${params.length}`);
  }
  if (filters.vertical) {
    params.push(filters.vertical);
    conditions.push(`p.vertical = $${params.length}`);
  }
  const where = conditions.length > 0 ? `where ${conditions.join(' and ')}` : '';
  return rows<ProjectSummary>(
    pool,
    `select ${SELECT_PROJET_COLUMNS}, c.nom as client_nom
     from projets p
     join clients c on c.id = p.client_id
     ${where}
     order by p.date_derniere_activite desc nulls last, p.nom`,
    params
  );
}

// Les projets "vivants" (hors terminés/archivés) : liste du tableau de bord.
export function listActiveProjects(pool: pg.Pool): Promise<ProjectSummary[]> {
  return rows<ProjectSummary>(
    pool,
    `select ${SELECT_PROJET_COLUMNS}, c.nom as client_nom
     from projets p
     join clients c on c.id = p.client_id
     where p.statut in ('en_cours', 'en_pause')
     order by p.date_derniere_activite desc nulls last, p.nom`
  );
}

export function getProject(pool: pg.Pool, projectId: string): Promise<ProjectWithClient | null> {
  return rows<ProjectWithClient>(
    pool,
    `select ${SELECT_PROJET_COLUMNS}, c.nom as client_nom, c.statut as client_statut
     from projets p
     join clients c on c.id = p.client_id
     where p.id = $1`,
    [projectId]
  ).then((result) => result[0] ?? null);
}

export function listProjectIntegrations(pool: pg.Pool, projectId: string): Promise<IntegrationRow[]> {
  return rows<IntegrationRow>(
    pool,
    `select * from integrations
     where projet_id = $1
     order by actif desc, type`,
    [projectId]
  );
}

// ---------------------------------------------------------------------------
// ACTIVITES (flux)
// ---------------------------------------------------------------------------

export function listProjectActivities(
  pool: pg.Pool,
  projectId: string,
  options: { limit: number } = { limit: 100 }
): Promise<ActivityRow[]> {
  return rows<ActivityRow>(
    pool,
    `select * from activites
     where projet_id = $1
     order by horodatage desc
     limit $2`,
    [projectId, options.limit]
  );
}

// Flux consolidé des dernières 48 h (tableau de bord) : l'un des deux seuls
// points d'agrégation multi-clients autorisés, avec la recherche transverse.
export function listRecentActivities(pool: pg.Pool, limit = 200): Promise<ActivityWithContext[]> {
  return rows<ActivityWithContext>(
    pool,
    `select a.*, p.nom as projet_nom, c.nom as client_nom
     from activites a
     join projets p on p.id = a.projet_id
     join clients c on c.id = p.client_id
     where a.horodatage >= now() - interval '48 hours'
     order by a.horodatage desc
     limit $1`,
    [limit]
  );
}

// Dernières activités de TOUS les projets d'un client (onglet historique de
// la vue client — agrégation bornée à un seul client, intention explicite).
export function listClientActivities(
  pool: pg.Pool,
  clientId: string,
  limit = 50
): Promise<ActivityWithContext[]> {
  return rows<ActivityWithContext>(
    pool,
    `select a.*, p.nom as projet_nom, c.nom as client_nom
     from activites a
     join projets p on p.id = a.projet_id
     join clients c on c.id = p.client_id
     where p.client_id = $1
     order by a.horodatage desc
     limit $2`,
    [clientId, limit]
  );
}

// ---------------------------------------------------------------------------
// ALERTES DU TABLEAU DE BORD
// Les trois alertes de la V1, calculées en SQL au moment de la requête.
// ---------------------------------------------------------------------------

export interface AlertProject {
  id: string;
  nom: string;
  client_nom: string;
  vertical: string;
  statut: string;
  date_derniere_activite: Date | null;
  date_echeance: string | null;
  montant_en_attente: number;
  jours: number; // porteur de l'alerte : jours d'inactivité / jours restants
}

// Projets vivants sans activité depuis plus de 14 jours.
// Un projet jamais actif (date NULL) n'alerte pas en V1 : on préfère une
// fausse alerte manquante à un bruit permanent sur les projets neufs.
export function listInactiveProjects(pool: pg.Pool): Promise<AlertProject[]> {
  return rows<AlertProject>(
    pool,
    `select p.id, p.nom, c.nom as client_nom, p.vertical, p.statut,
            p.date_derniere_activite, p.date_echeance,
            (p.montant_contractualise - p.montant_facture)::float8 as montant_en_attente,
            floor(extract(epoch from (now() - p.date_derniere_activite)) / 86400)::int as jours
     from projets p
     join clients c on c.id = p.client_id
     where p.statut in ('en_cours', 'en_pause')
       and p.date_derniere_activite is not null
       and p.date_derniere_activite < now() - interval '14 days'
     order by p.date_derniere_activite`
  );
}

// Échéances dans les 7 jours — y compris déjà dépassées (jours <= 0) :
// une échéance passée est la forme la plus urgente de cette alerte.
export function listUpcomingDeadlines(pool: pg.Pool): Promise<AlertProject[]> {
  return rows<AlertProject>(
    pool,
    `select p.id, p.nom, c.nom as client_nom, p.vertical, p.statut,
            p.date_derniere_activite, p.date_echeance,
            (p.montant_contractualise - p.montant_facture)::float8 as montant_en_attente,
            (p.date_echeance - current_date)::int as jours
     from projets p
     join clients c on c.id = p.client_id
     where p.statut not in ('termine', 'archive')
       and p.date_echeance is not null
       and p.date_echeance <= current_date + 7
     order by p.date_echeance`
  );
}

// Factures en attente : reste à facturer > 0 (hors projets archivés).
export function listPendingInvoices(pool: pg.Pool): Promise<AlertProject[]> {
  return rows<AlertProject>(
    pool,
    `select p.id, p.nom, c.nom as client_nom, p.vertical, p.statut,
            p.date_derniere_activite, p.date_echeance,
            (p.montant_contractualise - p.montant_facture)::float8 as montant_en_attente,
            0 as jours
     from projets p
     join clients c on c.id = p.client_id
     where p.statut <> 'archive'
       and p.montant_facture < p.montant_contractualise
     order by montant_en_attente desc`
  );
}

// ---------------------------------------------------------------------------
// RECHERCHE TRANSVERSE
// ---------------------------------------------------------------------------

export interface SearchResults {
  clients: ClientRow[];
  projets: ProjectSummary[];
  activites: ActivityWithContext[];
}

export async function searchAcross(
  pool: pg.Pool,
  query: string,
  limitPerType = 10
): Promise<SearchResults> {
  const pattern = `%${escapeLike(query)}%`;

  const clients = await rows<ClientRow>(
    pool,
    `select c.* from clients c
     where c.nom ilike $1 or c.email ilike $1 or c.contact_principal ilike $1
        or c.notes ilike $1
     order by c.nom
     limit $2`,
    [pattern, limitPerType]
  );

  const projets = await rows<ProjectSummary>(
    pool,
    `select ${SELECT_PROJET_COLUMNS}, c.nom as client_nom
     from projets p
     join clients c on c.id = p.client_id
     where p.nom ilike $1 or p.depot_github ilike $1 or p.notes ilike $1
        or c.nom ilike $1
     order by p.date_derniere_activite desc nulls last
     limit $2`,
    [pattern, limitPerType]
  );

  // Recherche dans le contenu des activités (payload) : cast ::text, coûteux
  // sur de gros volumes mais trivial à cette échelle. Si la recherche devient
  // lente, on migrera vers pg_trgm ou un index GIN (voir README).
  const activites = await rows<ActivityWithContext>(
    pool,
    `select a.*, p.nom as projet_nom, c.nom as client_nom
     from activites a
     join projets p on p.id = a.projet_id
     join clients c on c.id = p.client_id
     where a.payload::text ilike $1
     order by a.horodatage desc
     limit $2`,
    [pattern, limitPerType]
  );

  return { clients, projets, activites };
}

// ---------------------------------------------------------------------------
// JOURNAL (audit)
// ---------------------------------------------------------------------------

export function listJournalEntries(
  pool: pg.Pool,
  options: { limit: number; outil?: string } = { limit: 100 }
): Promise<JournalRow[]> {
  const params: unknown[] = [];
  let where = '';
  if (options.outil) {
    params.push(options.outil);
    where = `where outil = $${params.length}`;
  }
  params.push(options.limit);
  return rows<JournalRow>(
    pool,
    `select * from journal_outils
     ${where}
     order by horodatage desc
     limit $${params.length}`,
    params
  );
}
