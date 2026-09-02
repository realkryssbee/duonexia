// integrations/github/tool-names.ts — noms canoniques des outils GitHub.
// Ces constantes sont LA source de vérité partagée entre le module
// d'intégration (journalisation) et le registre d'outils (orchestration).

export const GITHUB_TOOL_NAMES = {
  repo: 'github.repo',
  commits: 'github.commits',
  pullRequests: 'github.pull_requests',
  branches: 'github.branches',
  branchLastCommit: 'github.branch_last_commit',
} as const;
