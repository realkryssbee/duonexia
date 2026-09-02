// orchestration/model/model-router.ts — L'INTERFACE du routeur de modèles.
//
// Contrainte critique de la spécification : l'orchestrateur ne doit JAMAIS
// appeler un fournisseur de modèle directement. Tout appel passe par cette
// interface, dont la signature est stable. Changer de fournisseur, ajouter
// un modèle ou router selon la sensibilité / complexité / budget se fait
// SANS modifier les couches qui consomment le routeur.
//
// Les deux implémentations de la V1 vivent dans providers/ :
//   * AnthropicRouter  — modèle propriétaire de dernière génération
//                        (raisonnement complexe, chaînes d'outils longues),
//                        réservé aux données NON sensibles ;
//   * DeepSeekEuRouter — poids ouverts (DeepSeek) servis depuis l'Union
//                        européenne : la seule voie acceptable pour les
//                        données clients (huissiers, paie, patients — RGPD).
//
// La V1 ne déclenche AUCUN appel : le socle est en lecture seule et sans
// agent. L'interface, les implémentations et la politique de routage sont
// écrites et testées au typage dès maintenant, pour que la V2 (l'agent) ne
// soit qu'un consommateur de plus.

export type DataSensitivity = 'internal' | 'client' | 'sensitive';
export type TaskComplexity = 'simple' | 'complex' | 'long';
export type TaskBudget = 'low' | 'normal' | 'high';

export interface ModelMessage {
  role: 'user' | 'assistant';
  content: string;
}

export interface ModelRequest {
  /** Instructions de cadrage (jamais de donnée externe ici). */
  system: string;
  /** Tour de conversation utilisateur/assistant (la donnée externe est
   *  encapsulée par context-builder avant d'arriver ici). */
  messages: ModelMessage[];
  task: {
    /** internal : code, notes internes — client : données d'un client —
     *  sensitive : données RGPD sensibles (paie, dossiers, patients). */
    sensitivity: DataSensitivity;
    complexity: TaskComplexity;
    budget: TaskBudget;
  };
  maxOutputTokens?: number;
}

export interface ModelUsage {
  inputTokens: number;
  outputTokens: number;
}

export interface ModelResponse {
  content: string;
  model: string; // identifiant du modèle réellement appelé (pour le journal)
  provider: string;
  usage: ModelUsage;
  finishReason: string;
}

export interface ModelRouter {
  /** Identifiant stable, ex. 'anthropic' ou 'deepseek-eu'. */
  readonly name: string;
  readonly provider: string;
  /** Zone d'hébergement des données traitées. Seul 'eu' est admissible pour
   *  les données de sensibilité client/sensitive. */
  readonly dataResidency: 'eu' | 'us' | 'other';
  /** true si les variables d'environnement du fournisseur sont présentes. */
  isConfigured(): boolean;
  complete(request: ModelRequest): Promise<ModelResponse>;
}

export class ModelError extends Error {
  constructor(
    message: string,
    readonly cause?: unknown
  ) {
    super(message);
    this.name = 'ModelError';
  }
}
