// types.ts — formes des réponses de l'API Cockpit.
// Les noms de champs suivent la base (snake_case) : l'API EST le contrat.

export interface Client {
  id: string;
  nom: string;
  vertical: string;
  contact_principal: string | null;
  email: string | null;
  telephone: string | null;
  date_dernier_contact: string | null;
  statut: string;
  notes: string | null;
  created_at: string;
  nb_projets?: number;
}

export interface Projet {
  id: string;
  client_id: string;
  client_nom?: string;
  client_statut?: string;
  nom: string;
  vertical: string;
  statut: string;
  depot_github: string | null;
  url_production: string | null;
  environnements?: Record<string, unknown>;
  montant_contractualise: number;
  montant_facture: number;
  date_debut: string | null;
  date_echeance: string | null;
  date_derniere_activite: string | null;
  notes: string | null;
  created_at?: string;
}

export interface AlerteProjet {
  id: string;
  nom: string;
  client_nom: string;
  vertical: string;
  statut: string;
  date_derniere_activite: string | null;
  date_echeance: string | null;
  montant_en_attente: number;
  jours: number;
}

export interface Activite {
  id: number;
  projet_id: string;
  source: string;
  type: string;
  payload: Record<string, unknown> | null;
  horodatage: string;
  projet_nom?: string;
  client_nom?: string;
}

export interface Integration {
  id: string;
  projet_id: string;
  type: string;
  identifiant_externe: string;
  metadata: Record<string, unknown>;
  actif: boolean;
  created_at: string;
}

export interface DashboardResponse {
  produitLe: string;
  projetsActifs: Projet[];
  alertes: {
    projetsInactifs: AlerteProjet[];
    echeancesProches: AlerteProjet[];
    facturesEnAttente: AlerteProjet[];
  };
  flux48h: Activite[];
}

export interface ClientDetailResponse {
  client: Client;
  projets: Projet[];
  historique: Activite[];
  engagement: {
    projetsVivants: number;
    contractualiseVivant: number;
    factureVivant: number;
  };
}

export interface ProjetDetailResponse {
  projet: Projet;
  integrations: Integration[];
  etatFinancier: {
    contractualise: number;
    facture: number;
    resteAFacturer: number;
    factureComplete: boolean;
  };
}

export interface RechercheResponse {
  requete: string;
  clients: Client[];
  projets: Projet[];
  activites: Activite[];
  nombre: { clients: number; projets: number; activites: number };
}
