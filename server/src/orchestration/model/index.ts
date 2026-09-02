// orchestration/model/index.ts — usine du routeur de modèles.
//
// Assemble les implémentations configurées depuis l'environnement et expose
// UNE façade PolicyRouter. En V2, l'orchestrateur (agent) injectera ce
// routeur unique ; en V1, personne ne l'appelle — le socle est en lecture
// seule. Ce fichier existe pour que le contrat soit vérifié au typage dès
// aujourd'hui (deux implémentations derrière une même interface).

import { env } from '../../config/env.js';
import { AnthropicRouter } from './providers/anthropic.js';
import { DeepSeekEuRouter } from './providers/deepseek-eu.js';
import { PolicyRouter } from './policy.js';
import type { ModelRouter } from './model-router.js';

export { ModelError, type ModelRequest, type ModelResponse, type ModelRouter } from './model-router.js';
export { PolicyRouter, pickRouter } from './policy.js';
export { AnthropicRouter } from './providers/anthropic.js';
export { DeepSeekEuRouter } from './providers/deepseek-eu.js';

/** Tous les routeurs configurés (jetons présents), prêts à router. */
export function buildConfiguredRouters(): ModelRouter[] {
  const routers: ModelRouter[] = [
    new AnthropicRouter({
      apiKey: env.anthropicApiKey,
      apiUrl: env.anthropicApiUrl,
      model: env.anthropicModel,
    }),
    new DeepSeekEuRouter({
      baseUrl: env.deepseekEuBaseUrl,
      apiKey: env.deepseekEuApiKey,
      model: env.deepseekEuModel,
    }),
  ];
  return routers.filter((router) => router.isConfigured());
}

/** La façade unique que consommera l'orchestrateur (V2). */
export function createModelRouter(): ModelRouter {
  return new PolicyRouter({ candidates: buildConfiguredRouters() });
}
