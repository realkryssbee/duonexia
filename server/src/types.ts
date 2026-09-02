// types.ts — formes de lignes renvoyées par la base, partagées par les
// requêtes SQL et les routes HTTP. Les montants arrivent en number (cast
// ::float8 dans les requêtes), les timestamps en Date (sérialisés en ISO par
// Fastify), les jsonb déjà désérialisés par le driver pg.

// Les libellés d'affichage (français) ne vivent PAS ici : ils sont du ressort
// de l'interface. Ici, uniquement des slugs ASCII.

export interface ClientRow {
  id: string;
  nom: string;
  vertical: string;
  contact_principal: string | null;
  email: string | null;
  telephone: string | null;
  date_dernier_contact: Date | null;
  statut: string;
  notes: string | null;
  created_at: Date;
}

export interface ProjectRow {
  id: string;
  client_id: string;
  nom: string;
  vertical: string;
  statut: string;
  depot_github: string | null;
  url_production: string | null;
  environnements: Record<string, unknown>;
  montant_contractualise: number;
  montant_facture: number;
  date_debut: string | null; // colonne date -> 'YYYY-MM-DD'
  date_echeance: string | null;
  date_derniere_activite: Date | null;
  notes: string | null;
  created_at: Date;
}

export interface ProjectWithClient extends ProjectRow {
  client_nom: string;
  client_statut: string;
}

export interface IntegrationRow {
  id: string;
  projet_id: string;
  type: string;
  identifiant_externe: string;
  metadata: Record<string, unknown>;
  actif: boolean;
  created_at: Date;
}

export interface ActivityRow {
  id: number;
  projet_id: string;
  source: string;
  type: string;
  payload: Record<string, unknown> | null;
  horodatage: Date;
}

// Activité enrichie pour l'affichage : on joint le projet et le client pour
// que le flux global du tableau de bord soit directement présentable.
export interface ActivityWithContext extends ActivityRow {
  projet_nom: string;
  client_nom: string;
}

export interface JournalRow {
  id: number;
  outil: string;
  arguments: Record<string, unknown> | null;
  resultat: Record<string, unknown> | null;
  duree_ms: number | null;
  statut: string;
  horodatage: Date;
  utilisateur: string;
}

export interface ProjectSummary {
  id: string;
  nom: string;
  statut: string;
  client_id: string;
  client_nom: string;
  vertical: string;
  date_derniere_activite: Date | null;
  date_echeance: string | null;
  montant_contractualise: number;
  montant_facture: number;
}
