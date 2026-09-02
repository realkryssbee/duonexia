// integrations/index.ts — l'usine d'intégrations.
//
// Le SEUL endroit à modifier pour brancher un nouveau service externe
// (cf. integrations/integration.ts pour la procédure complète). Le job de
// synchronisation et l'orchestrateur ne connaissent que IntegrationService.

import {
  ExternalServiceError,
  type IntegrationDeps,
  type IntegrationService,
} from './integration.js';
import { GithubIntegration } from './github/github-integration.js';
import { VercelIntegration } from './vercel/vercel-integration.js';
import { FakeIntegration } from './fake/fake-integration.js';

export { ExternalServiceError } from './integration.js';
export type {
  ActivityType,
  HttpGetOptions,
  HttpTransport,
  IntegrationService,
  IntegrationTarget,
  RawActivity,
} from './integration.js';

export const SUPPORTED_TYPES = ['github', 'vercel', 'fake'] as const;

export function createIntegrationService(
  type: string,
  deps: IntegrationDeps
): IntegrationService {
  switch (type) {
    case 'github':
      return new GithubIntegration(deps);
    case 'vercel':
      return new VercelIntegration(deps);
    case 'fake':
      // Le module factice ne touche aucun réseau : pas de transport requis.
      return new FakeIntegration();
    default:
      throw new ExternalServiceError(
        `Type d'intégration inconnu : "${type}". Types disponibles : ${SUPPORTED_TYPES.join(', ')} ` +
          `(jira, supabase, nas et mail s'ajouteront en V2 sans toucher aux autres couches).`
      );
  }
}
