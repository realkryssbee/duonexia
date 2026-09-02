// scripts/lier-repos-github.ts — liaison en masse de dépôts GitHub dans
// Cockpit : pour chaque dépôt du mapping, la liaison crée (ou retrouve)
//   client → projet (depot_github = repo) → intégration (type github, active).
//
// Usage (depuis server/, variables via server/.env) :
//   npx tsx scripts/lier-repos-github.ts [chemin-du-mapping.json] [--dry-run]
//     - mapping par défaut : db/mapping-repos.json (racine du dépôt) ;
//     - --dry-run : affiche le plan détaillé SANS rien écrire.
//
// Le mapping est un tableau JSON — voir db/mapping-repos.exemple.json.
// IDEMPOTENT : relancer ne crée aucun doublon (upsert par nom de client, par
// depot_github, ON CONFLICT sur l'intégration). Une erreur de mapping
// annule TOUT le passage (une seule transaction).
//
// Après la liaison : lancer une synchronisation (bouton « Synchroniser
// maintenant » ou POST /api/sync/run) pour remplir activites et aperçus.

import 'dotenv/config';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

// Valeurs admises par les contraintes SQL (0001_init.sql) : on valide en
// amont pour une erreur lisible au lieu d'un échec de transaction.
const VERTICALS = new Set([
  'huissiers', 'secretariats_sociaux', 'achats_pharmaceutiques',
  'coachs_sportifs', 'bien_etre', 'astrologie',
]);
const STATUTS_CLIENT = new Set(['prospect', 'actif', 'suspendu', 'ancien']);
const STATUTS_PROJET = new Set(['en_cours', 'en_pause', 'termine', 'archive']);

interface MappingClient {
  nom: string;
  vertical?: string;
  statut?: string;
  notes?: string | null;
}

interface MappingProjet {
  nom?: string;
  statut?: string;
  vertical?: string;
  url_production?: string | null;
  montant_contractualise?: number;
  montant_facture?: number;
  notes?: string | null;
}

interface Mapping {
  /** Dépôt GitHub au format "owner/repo". */
  repo: string;
  /** Soit un client existant (nom exact), soit les données d'un nouveau. */
  clientExistant?: string;
  client?: MappingClient;
  projet?: MappingProjet;
}

const REPO_PATTERN = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/;

function nomDepuisRepo(repo: string): string {
  // "realkryssbee/task-manager" -> "Task manager" (sans l'owner, lisible).
  const nom = (repo.split('/')[1] ?? repo).replace(/[-_]/g, ' ');
  return nom.charAt(0).toUpperCase() + nom.slice(1);
}

function valider(mapping: Mapping[]): void {
  mapping.forEach((entree, index) => {
    const numero = index + 1;
    if (!REPO_PATTERN.test(entree.repo)) {
      throw new Error(`Entrée ${numero} : repo invalide "${entree.repo}" (attendu owner/repo).`);
    }
    const aClient = Boolean(entree.client?.nom);
    const aClientExistant = Boolean(entree.clientExistant);
    if (aClient === aClientExistant) {
      throw new Error(
        `Entrée ${numero} (${entree.repo}) : renseigner SOIT client.nom (création) SOIT clientExistant (nom exact), pas les deux ni aucun.`
      );
    }
    const client = entree.client;
    if (client?.vertical && !VERTICALS.has(client.vertical)) {
      throw new Error(`Entrée ${numero} : vertical client invalide "${client.vertical}".`);
    }
    if (client?.statut && !STATUTS_CLIENT.has(client.statut)) {
      throw new Error(`Entrée ${numero} : statut client invalide "${client.statut}".`);
    }
    const projet = entree.projet ?? {};
    if (projet.vertical && !VERTICALS.has(projet.vertical)) {
      throw new Error(`Entrée ${numero} : vertical projet invalide "${projet.vertical}".`);
    }
    if (projet.statut && !STATUTS_PROJET.has(projet.statut)) {
      throw new Error(`Entrée ${numero} : statut projet invalide "${projet.statut}".`);
    }
    const contractualise = projet.montant_contractualise ?? 0;
    const facture = projet.montant_facture ?? 0;
    if (contractualise < 0 || facture < 0 || facture > contractualise) {
      throw new Error(
        `Entrée ${numero} : montants incohérents (contractualise=${contractualise}, facture=${facture}).`
      );
    }
  });
}

async function main(): Promise<void> {
  const databaseUrl = process.env.DATABASE_URL ?? '';
  if (databaseUrl === '') {
    console.error('[lier-repos] DATABASE_URL manquante (server/.env).');
    process.exit(1);
  }
  if (!['require', 'disable', 'verify-full'].includes(process.env.PGSSLMODE ?? 'require')) {
    // laissé au driver : pas de validation stricte nécessaire ici
  }

  // Fichier de mapping : argument JSON éventuel, sinon db/mapping-repos.json.
  const argumentsJson = process.argv.filter(
    (arg) => arg.endsWith('.json') && !arg.startsWith('-')
  );
  const sec = process.argv.includes('--dry-run');
  const cheminMapping = argumentsJson.length
    ? path.resolve(argumentsJson[0])
    : path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'db', 'mapping-repos.json');

  let mapping: Mapping[];
  try {
    mapping = JSON.parse(await readFile(cheminMapping, 'utf8')) as Mapping[];
  } catch (error) {
    console.error(`[lier-repos] Impossible de lire ${cheminMapping} :`, error);
    process.exit(1);
  }
  if (!Array.isArray(mapping) || mapping.length === 0) {
    console.error('[lier-repos] Le mapping doit être un tableau JSON non vide.');
    process.exit(1);
  }
  valider(mapping);
  console.info(
    `[lier-repos] ${mapping.length} dépôt(s) — ${cheminMapping}${sec ? ' — MODE DRY-RUN (aucune écriture)' : ''}`
  );

  const sslMode = process.env.PGSSLMODE ?? 'require';
  const db = new pg.Client({
    connectionString: databaseUrl,
    ssl: sslMode === 'disable' ? false : { rejectUnauthorized: sslMode === 'verify-full' },
  });
  await db.connect();

  try {
    await db.query('begin');
    for (const [index, entree] of mapping.entries()) {
      console.info(`\n[lier-repos] ${index + 1}/${mapping.length} — ${entree.repo}`);

      // ---- 1. Client -------------------------------------------------------
      let clientId: string | null = null;
      if (entree.clientExistant) {
        const ligne = await db.query('select id from clients where nom = $1', [entree.clientExistant]);
        if (ligne.rows.length === 0) {
          throw new Error(`Client existant introuvable : "${entree.clientExistant}".`);
        }
        clientId = ligne.rows[0].id;
        console.info(`  → client existant : ${entree.clientExistant}`);
      } else {
        const c = entree.client as MappingClient;
        const ligne = await db.query('select id from clients where nom = $1', [c.nom]);
        if (ligne.rows.length > 0) {
          clientId = ligne.rows[0].id;
          console.info(`  → client déjà présent : ${c.nom}`);
        } else if (sec) {
          console.info(`  → (dry-run) créerait le client : ${c.nom} [${c.vertical ?? 'vertical à préciser'}]`);
        } else {
          const insere = await db.query(
            `insert into clients (nom, vertical, statut, notes)
             values ($1, $2, $3, $4) returning id`,
            [c.nom, c.vertical ?? 'coachs_sportifs', c.statut ?? 'actif', c.notes ?? null]
          );
          clientId = insere.rows[0].id;
          console.info(`  → client créé : ${c.nom} [${c.vertical ?? 'coachs_sportifs'}]`);
        }
      }

      // ---- 2. Projet (retrouvé par depot_github) ----------------------------
      const p = entree.projet ?? {};
      const projetExistant = await db.query('select id, nom from projets where depot_github = $1', [entree.repo]);
      let projetId: string | null = null;
      if (projetExistant.rows.length > 0) {
        projetId = projetExistant.rows[0].id;
        console.info(`  → projet déjà présent : ${projetExistant.rows[0].nom}`);
      } else if (sec) {
        const nom = p.nom ?? nomDepuisRepo(entree.repo);
        const vertical = p.vertical ?? entree.client?.vertical ?? 'coachs_sportifs';
        console.info(`  → (dry-run) créerait le projet : ${nom} [${vertical}]`);
      } else if (clientId) {
        const nom = p.nom ?? nomDepuisRepo(entree.repo);
        const vertical = p.vertical ?? entree.client?.vertical ?? 'coachs_sportifs';
        const insere = await db.query(
          `insert into projets
             (client_id, nom, vertical, statut, depot_github, url_production,
              montant_contractualise, montant_facture, notes)
           values ($1, $2, $3, $4, $5, $6, $7, $8, $9)
           returning id`,
          [
            clientId, nom, vertical, p.statut ?? 'en_cours', entree.repo,
            p.url_production ?? null, p.montant_contractualise ?? 0,
            p.montant_facture ?? 0, p.notes ?? null,
          ]
        );
        projetId = insere.rows[0].id;
        console.info(`  → projet créé : ${nom} [${vertical}]`);
      }

      // ---- 3. Intégration GitHub (idempotente) ------------------------------
      if (projetId) {
        await db.query(
          `insert into integrations (projet_id, type, identifiant_externe, metadata, actif)
           values ($1, 'github', $2, '{}'::jsonb, true)
           on conflict (projet_id, type, identifiant_externe) do nothing`,
          [projetId, entree.repo]
        );
        console.info(`  → intégration github active : ${entree.repo}`);
      } else {
        console.info(`  → (dry-run) ajouterait l'intégration github : ${entree.repo}`);
      }
    }

    if (sec) {
      await db.query('rollback');
      console.info('\n[lier-repos] Dry-run terminé — rien n’a été écrit.');
    } else {
      await db.query('commit');
      console.info('\n[lier-repos] Liaison terminée. Pensez à déclencher une synchronisation.');
    }
  } catch (error) {
    await db.query('rollback');
    console.error('\n[lier-repos] ÉCHEC — rien n’a été écrit :', error);
    process.exit(1);
  } finally {
    await db.end();
  }
}

main().catch((error) => {
  console.error('[lier-repos] Échec technique :', error);
  process.exit(1);
});
