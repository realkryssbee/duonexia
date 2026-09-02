// integrations/vercel/vercel-integration.ts — lecture Vercel (V1, lecture
// seule) : déploiements, statut, domaines.
//
// Le mapping projet -> projet Vercel se fait par
// integrations.identifiant_externe (id ou nom du projet Vercel).
// Si les projets sont hébergés sous une équipe Vercel, renseignez
// VERCEL_TEAM_ID : le paramètre teamId est ajouté à chaque requête.
//
// Déploiements = événements (activites) ; domaines et état du projet =
// instantané d'aperçu (integrations.metadata), comme côté GitHub.

import {
  type HttpGetOptions,
  type HttpTransport,
  type IntegrationDeps,
  type IntegrationService,
  type IntegrationTarget,
  type RawActivity,
} from '../integration.js';
import { VERCEL_TOOL_NAMES } from './tool-names.js';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Json = any;

export class VercelIntegration implements IntegrationService {
  readonly type = 'vercel';
  readonly label = 'Vercel (déploiements, statut, domaines)';

  private readonly http: HttpTransport;
  private readonly teamId: string | null;

  constructor(deps: IntegrationDeps) {
    this.http = deps.http;
    this.teamId = deps.teamId ?? null;
  }

  /** Ajoute teamId aux appels si le compte Vercel est une équipe. */
  private async get(path: string, options: Omit<HttpGetOptions, 'headers'>): Promise<Json> {
    const query = { ...(options.query ?? {}) };
    if (this.teamId) query.teamId = this.teamId;
    return this.http.getJson(path, { ...options, query });
  }

  /** Événements : les déploiements récents, quel que soit leur statut. */
  async fetchActivities(
    target: IntegrationTarget,
    options: { since: Date }
  ): Promise<RawActivity[]> {
    const data = await this.get('/v6/deployments', {
      query: {
        projectId: target.identifiantExterne,
        limit: '30',
      },
      tool: VERCEL_TOOL_NAMES.deployments,
      toolArgs: { projet: target.identifiantExterne },
    });

    const deployments: Json[] = Array.isArray(data?.deployments) ? data.deployments : [];
    const sinceMs = options.since.getTime();

    return deployments
      .filter((deployment) => typeof deployment?.created === 'number' && deployment.created >= sinceMs)
      .map((deployment) => ({
        externalId: String(deployment?.uid ?? deployment?.id ?? ''),
        type: 'deployment' as const,
        payload: {
          deploymentId: deployment?.uid ?? deployment?.id ?? null,
          url: deployment?.url ?? null,
          environnement: deployment?.target ?? null, // production / preview
          etat: deployment?.readyState ?? 'UNKNOWN', // READY, ERROR, BUILDING…
          meta: deployment?.meta ?? null,
        },
        horodatage: new Date(deployment?.created as number),
      }));
  }

  /**
   * Instantané d'aperçu : état du projet + domaines rattachés.
   */
  async fetchProjectMetadata(target: IntegrationTarget): Promise<Record<string, unknown>> {
    const id = target.identifiantExterne;

    const project = await this.get(`/v9/projects/${encodeURIComponent(id)}`, {
      tool: VERCEL_TOOL_NAMES.project,
      toolArgs: { projet: id },
    });

    const domainsData = await this.get(`/v6/projects/${encodeURIComponent(id)}/domains`, {
      tool: VERCEL_TOOL_NAMES.domains,
      toolArgs: { projet: id },
    });

    const domains: string[] = (Array.isArray(domainsData?.domains) ? domainsData.domains : [])
      .map((domain: Json) => domain?.name)
      .filter((name: unknown): name is string => typeof name === 'string');

    return {
      pulledAt: new Date().toISOString(),
      project: {
        id: project?.id ?? null,
        name: project?.name ?? null,
        updatedAt: project?.updatedAt ?? null,
      },
      domains,
    };
  }
}
