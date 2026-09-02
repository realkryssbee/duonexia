// orchestration/model/policy.ts — la politique de routage.
//
// Décision documentée (cf. business plan §6.4) : on route selon trois
// critères, par ordre de priorité :
//   1. SENSIBILITÉ des données — prépondérante, c'est une obligation RGPD :
//      toute donnée client/sensitive ne part que vers un routeur dont la
//      résidence est 'eu'. S'il n'y en a aucun de configuré, la tâche est
//      REFUSÉE (jamais de repli silencieux vers un fournisseur hors UE).
//   2. COMPLEXITÉ de la tâche — raisonnement complexe / chaîne d'outils
//      longue : modèle propriétaire (fiabilité d'appel d'outils supérieure)
//      quand la sensibilité le permet.
//   3. BUDGET — en égalité, on préfère le moins cher ('low' favorise
//      l'inférence UE, réputée meilleur rapport qualité-prix à volume).
//
// La classe PolicyRouter est elle-même un ModelRouter : l'orchestrateur ne
// connaît QUE cette façade et ne sélectionne jamais un fournisseur lui-même.

import {
  ModelError,
  type ModelRequest,
  type ModelResponse,
  type ModelRouter,
} from './model-router.js';

export function pickRouter(request: ModelRequest, candidates: ModelRouter[]): ModelRouter {
  const configured = candidates.filter((router) => router.isConfigured());
  if (configured.length === 0) {
    throw new ModelError(
      'Aucun routeur de modèle configuré (renseignez ANTHROPIC_API_KEY et/ou les variables DEEPSEEK_EU_*).'
    );
  }

  const inEu = configured.filter((router) => router.dataResidency === 'eu');
  const outsideEu = configured.filter((router) => router.dataResidency !== 'eu');
  const { sensitivity, complexity, budget } = request.task;

  // --- 1. Données client/sensitive : l'UE est une obligation, pas un choix.
  if (sensitivity !== 'internal') {
    if (inEu.length === 0) {
      throw new ModelError(
        'Tâche sur données client sans routeur résidant dans l\'UE configuré. ' +
          'Refus explicite : renseignez DEEPSEEK_EU_BASE_URL avant d\'envoyer ce type de données.'
      );
    }
    // Parmi les routeurs UE : le plus cher/best effort selon la complexité
    // reste à l'intérieur de l'UE — la liste étant courte en V1, on prend le
    // premier configuré. La priorité UE ne se discute pas.
    return inEu[0];
  }

  // --- 2/3. Données internes (code, notes) : complexité puis budget.
  const needsPremium = complexity === 'complex' || complexity === 'long';
  if (needsPremium && outsideEu.length > 0) {
    // Propriétaire de dernière génération pour le raisonnement exigeant.
    return outsideEu[0];
  }
  if (budget === 'low' && inEu.length > 0) {
    return inEu[0];
  }
  // Repli raisonnable : n'importe quel routeur configuré.
  return configured[0];
}

export interface PolicyRouterOptions {
  candidates: ModelRouter[];
}

/**
 * Façade stable : le choix du fournisseur se fait à CHAQUE requête selon les
 * critères ci-dessus, derrière la même interface ModelRouter.
 */
export class PolicyRouter implements ModelRouter {
  readonly name = 'policy';
  readonly provider = 'policy';
  readonly dataResidency = 'eu' as const;

  constructor(private readonly options: PolicyRouterOptions) {}

  isConfigured(): boolean {
    return this.options.candidates.some((router) => router.isConfigured());
  }

  complete(request: ModelRequest): Promise<ModelResponse> {
    const router = pickRouter(request, this.options.candidates);
    return router.complete(request);
  }
}
