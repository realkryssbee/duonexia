// integrations/github/github-integration.ts — lecture GitHub (V1, lecture
// seule) : dépôt, derniers commits, pull requests ouvertes, branches actives.
//
// Le mapping projet -> dépôt se fait par integrations.identifiant_externe au
// format "owner/repo" (projets.depot_github est un raccourci de saisie pour
// le dépôt principal, l'enregistrement officiel reste la table integrations).
//
// Aucun fetch direct : tout passe par la HttpTransport journalisée fournie
// par l'orchestrateur — chaque appel est donc tracé dans journal_outils.

import {
  ExternalServiceError,
  type HttpGetOptions,
  type HttpTransport,
  type IntegrationDeps,
  type IntegrationService,
  type IntegrationTarget,
  type RawActivity,
} from '../integration.js';
import { GITHUB_TOOL_NAMES } from './tool-names.js';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Json = any;

// Nombre de branches interrogées pour calculer les "branches actives"
// (une requête de plus par branche). Au-delà, on se limite : la V1 vise
// l'essentiel, pas l'exhaustivité.
const ACTIVE_BRANCHES_LIMIT = 6;

export class GithubIntegration implements IntegrationService {
  readonly type = 'github';
  readonly label = 'GitHub (dépôts, commits, PR, branches)';

  private readonly http: HttpTransport;

  constructor(deps: IntegrationDeps) {
    this.http = deps.http;
  }

  /** "owner/repo" -> { owner, repo }. */
  private splitRepo(identifiantExterne: string): { owner: string; repo: string } {
    const parts = identifiantExterne.split('/');
    if (parts.length !== 2 || parts[0] === '' || parts[1] === '') {
      throw new ExternalServiceError(
        `identifiant_externe GitHub invalide : "${identifiantExterne}" (attendu "owner/repo").`
      );
    }
    return { owner: parts[0], repo: parts[1] };
  }

  /** Appels de base typés autour de la HttpTransport. */
  private async get(
    path: string,
    options: Omit<HttpGetOptions, 'headers'>,
    accept?: string
  ): Promise<Json> {
    const result = await this.http.getJson(path, {
      ...options,
      headers: accept ? { accept } : undefined,
    });
    return result;
  }

  /**
   * Événements récents : les commits (les PR ouvertes et branches actives
   * sont un état, pas un événement : ils vivent dans l'aperçu/metadata).
   */
  async fetchActivities(
    target: IntegrationTarget,
    options: { since: Date }
  ): Promise<RawActivity[]> {
    const { owner, repo } = this.splitRepo(target.identifiantExterne);
    const fullName = `${owner}/${repo}`;

    let data: Json;
    try {
      data = await this.get(`/repos/${fullName}/commits`, {
        query: { per_page: '30', since: options.since.toISOString() },
        tool: GITHUB_TOOL_NAMES.commits,
        toolArgs: { repo: fullName },
      });
    } catch (error) {
      // Cas bénin : dépôt sans aucun commit (GitHub répond 409 "Git
      // Repository is empty"). Ce n'est pas un échec du branchement : il n'y
      // a simplement aucun événement à remonter. L'aperçu (metadata) reste
      // rafraîchi par ailleurs.
      if (this.isEmptyRepoError(error)) {
        return [];
      }
      throw error;
    }

    const commits = Array.isArray(data) ? data : [];
    return commits.map((commit: Json) => {
      const author = commit?.commit?.author;
      return {
        externalId: String(commit?.sha ?? ''),
        type: 'commit' as const,
        payload: {
          sha: commit?.sha ?? null,
          message: commit?.commit?.message ?? '',
          auteur: { nom: author?.name ?? null, email: author?.email ?? null },
          url: commit?.html_url ?? null,
        },
        horodatage: author?.date ? new Date(author.date) : new Date(),
      };
    });
  }

  /** GitHub 409 "Git Repository is empty" : dépôt sans commit. */
  private isEmptyRepoError(error: unknown): boolean {
    return (
      error instanceof ExternalServiceError &&
      error.statusCode === 409 &&
      error.message.toLowerCase().includes('empty')
    );
  }

  /**
   * Instantané d'aperçu stocké dans integrations.metadata (rafraîchi par le
   * job de sync) : état du dépôt, PR ouvertes, branches actives.
   */
  async fetchProjectMetadata(target: IntegrationTarget): Promise<Record<string, unknown>> {
    const { owner, repo } = this.splitRepo(target.identifiantExterne);
    const fullName = `${owner}/${repo}`;

    // 1. État du dépôt.
    const repoData = await this.get(`/repos/${fullName}`, {
      tool: GITHUB_TOOL_NAMES.repo,
      toolArgs: { repo: fullName },
    });
    const defaultBranch: string = repoData?.default_branch ?? 'main';

    // 2. Pull requests ouvertes (état courant, pas un flux d'événements).
    const pullsData = await this.get(`/repos/${fullName}/pulls`, {
      query: { state: 'open', per_page: '10' },
      tool: GITHUB_TOOL_NAMES.pullRequests,
      toolArgs: { repo: fullName },
    });
    const openPullRequests = (Array.isArray(pullsData) ? pullsData : []).map((pr: Json) => ({
      number: pr?.number ?? null,
      title: pr?.title ?? '',
      url: pr?.html_url ?? null,
      auteur: pr?.user?.login ?? null,
      creeLe: pr?.created_at ?? null,
      misAJourLe: pr?.updated_at ?? null,
      branche: pr?.head?.ref ?? null,
    }));

    // 3. Branches actives : on prend les premières branches (tri alphabétique
    // de l'API), on interroge leur dernier commit, on garde les plus récentes.
    const branchesData = await this.get(`/repos/${fullName}/branches`, {
      query: { per_page: '100' },
      tool: GITHUB_TOOL_NAMES.branches,
      toolArgs: { repo: fullName },
    });
    const branchNames: string[] = (Array.isArray(branchesData) ? branchesData : [])
      .map((branch: Json) => branch?.name)
      .filter((name: unknown): name is string => typeof name === 'string')
      .slice(0, ACTIVE_BRANCHES_LIMIT);

    const branchSnapshots = await Promise.all(
      branchNames.map(async (branch) => {
        const last = await this.get(`/repos/${fullName}/commits`, {
          query: { sha: branch, per_page: '1' },
          tool: GITHUB_TOOL_NAMES.branchLastCommit,
          toolArgs: { repo: fullName, branche: branch },
        });
        const first = Array.isArray(last) ? last[0] : undefined;
        const date = first?.commit?.committer?.date ?? null;
        return {
          name: branch,
          dernierCommit: first?.sha ?? null,
          dernierCommitDate: date ? new Date(date).toISOString() : null,
        };
      })
    );
    // Tri par date décroissante : les branches qui ont bougé récemment d'abord.
    const activeBranches = branchSnapshots
      .filter((snapshot) => snapshot.dernierCommitDate !== null)
      .sort(
        (a, b) =>
          new Date(b.dernierCommitDate as string).getTime() -
          new Date(a.dernierCommitDate as string).getTime()
      );

    return {
      pulledAt: new Date().toISOString(),
      repo: {
        fullName,
        defaultBranch,
        archived: Boolean(repoData?.archived),
        pushedAt: repoData?.pushed_at ?? null,
        url: repoData?.html_url ?? null,
        description: repoData?.description ?? null,
      },
      openPullRequests,
      activeBranches,
    };
  }
}
