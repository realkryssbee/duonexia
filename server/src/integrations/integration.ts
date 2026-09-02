// integrations/integration.ts — L'INTERFACE COMMUNE des intégrations.
//
// Décision d'architecture : chaque service externe (GitHub, Vercel, puis
// Jira, Supabase, NAS Synology, messagerie) est un module derrière CETTE
// interface. Ajouter un service exige :
//   1. un nouveau dossier integrations/<service>/ implémentant l'interface ;
//   2. son enregistrement dans l'usine integrations/index.ts ;
//   3. l'ajout de son type à la contrainte SQL (une migration d'une ligne).
// Aucune modification des couches Interface ni Orchestration.
//
// Transport HTTP : les modules ne font JAMAIS de fetch eux-mêmes. Ils
// reçoivent une HttpTransport (interface déclarée ici) dont l'implémentation
// journalisée est fournie par l'orchestrateur — ainsi la journalisation de
// chaque appel externe est garantie par construction, et un module
// d'intégration ne peut pas "oublier" de journaliser.

export type ActivityType =
  | 'commit'
  | 'pull_request'
  | 'deployment'
  | 'issue'
  | 'alerte'
  | 'manuel';

/** Un événement prêt à être inséré dans activites (avant déduplication). */
export interface RawActivity {
  /** Identifiant externe stable (sha de commit, uid de déploiement…). */
  externalId: string;
  type: ActivityType;
  payload: Record<string, unknown>;
  horodatage: Date;
}

/** La cible d'un appel : le branchement enregistré dans la table integrations. */
export interface IntegrationTarget {
  projetId: string;
  integrationId: string;
  /** ex. "owner/repo" (GitHub), "prj_xxx" (Vercel). */
  identifiantExterne: string;
  metadata: Record<string, unknown>;
}

export interface HttpGetOptions {
  query?: Record<string, string>;
  headers?: Record<string, string>;
  /** Nom canonique de l'outil (registre) — ex. 'github.commits'. */
  tool: string;
  /** Arguments compacts et SANS secret, pour le journal. */
  toolArgs: Record<string, unknown>;
}

export interface HttpTransport {
  /** GET JSON. Lève ExternalServiceError si le service répond hors 2xx. */
  getJson(path: string, options: HttpGetOptions): Promise<unknown>;
}

export interface IntegrationService {
  readonly type: string;
  readonly label: string;
  /**
   * Remonte les événements récents (V1 : commits, déploiements) depuis le
   * système externe. Lecture seule, strictement.
   */
  fetchActivities(
    target: IntegrationTarget,
    options: { since: Date }
  ): Promise<RawActivity[]>;
  /**
   * Optionnel : remonte un "instantané d'aperçu" (PR ouvertes, branches
   * actives, domaines…) qui sera stocké dans integrations.metadata.
   */
  fetchProjectMetadata?(target: IntegrationTarget): Promise<Record<string, unknown>>;
}

/** Erreur d'appel à un système externe (HTTP, jeton, format…). */
export class ExternalServiceError extends Error {
  /**
   * Code HTTP quand l'erreur vient d'une réponse non-2xx (utile pour
   * distinguer un cas bénin — ex. GitHub 409 « repository empty » — d'un
   * vrai échec).
   */
  readonly statusCode?: number;

  constructor(message: string, statusCode?: number, readonly cause?: unknown) {
    super(message);
    this.name = 'ExternalServiceError';
    this.statusCode = statusCode;
  }
}

/** Dépendances communes fournies par l'usine au moment de la construction. */
export interface IntegrationDeps {
  http: HttpTransport;
  /** Identifiant d'équipe Vercel, si les projets sont sous une équipe. */
  teamId?: string | null;
}
