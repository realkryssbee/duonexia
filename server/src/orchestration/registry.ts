// orchestration/registry.ts — registre d'outils.
//
// L'orchestrateur expose un registre : chaque outil a un nom canonique
// (celui qui apparaît dans journal_outils.outil), une description, une
// nature lecture/écriture et un niveau de permission requis.
//
// V1 : la liste est fixe et toutes les entrées sont en LECTURE — le socle ne
// peut rien casser. La V2 (agent) puisera ses outils dans CE registre, sans
// modifier la couche d'intégration : c'est le point de contrôle unique où
// l'on décidera qu'un outil devient exécutable par l'agent.

export type ToolKind = 'lecture' | 'ecriture';
export type ToolPermission = 'associe'; // V1 : les deux associés ont le même niveau

export interface ToolEntry {
  name: string; // nom canonique, ex. 'github.commits'
  kind: ToolKind;
  permission: ToolPermission;
  description: string;
  // true si l'outil appelle un système externe (donc soumis au journal) ;
  // les lectures en base pure ne sont pas des "appels d'outil" au sens de la
  // journalisation externe.
  touchesExterne: boolean;
}

// Les noms des modules d'intégration (github/, vercel/, fake/) sont importés
// ici pour garantir l'unicité : une seule source de vérité entre le registre,
// le journal et les modules.
import { GITHUB_TOOL_NAMES } from '../integrations/github/tool-names.js';
import { VERCEL_TOOL_NAMES } from '../integrations/vercel/tool-names.js';
import { FAKE_TOOL_NAMES } from '../integrations/fake/tool-names.js';

export const toolsRegistry: ToolEntry[] = [
  // --- Intégration GitHub (lecture) ---
  {
    name: GITHUB_TOOL_NAMES.repo,
    kind: 'lecture',
    permission: 'associe',
    touchesExterne: true,
    description: 'Lit le dépôt GitHub (branche par défaut, activité, archivage).',
  },
  {
    name: GITHUB_TOOL_NAMES.commits,
    kind: 'lecture',
    permission: 'associe',
    touchesExterne: true,
    description: 'Liste les derniers commits d\'un dépôt.',
  },
  {
    name: GITHUB_TOOL_NAMES.pullRequests,
    kind: 'lecture',
    permission: 'associe',
    touchesExterne: true,
    description: 'Liste les pull requests ouvertes d\'un dépôt.',
  },
  {
    name: GITHUB_TOOL_NAMES.branches,
    kind: 'lecture',
    permission: 'associe',
    touchesExterne: true,
    description: 'Liste les branches d\'un dépôt.',
  },
  {
    name: GITHUB_TOOL_NAMES.branchLastCommit,
    kind: 'lecture',
    permission: 'associe',
    touchesExterne: true,
    description: 'Date du dernier commit d\'une branche (calcule les branches actives).',
  },

  // --- Intégration Vercel (lecture) ---
  {
    name: VERCEL_TOOL_NAMES.deployments,
    kind: 'lecture',
    permission: 'associe',
    touchesExterne: true,
    description: 'Liste les derniers déploiements d\'un projet Vercel.',
  },
  {
    name: VERCEL_TOOL_NAMES.project,
    kind: 'lecture',
    permission: 'associe',
    touchesExterne: true,
    description: 'Lit le projet Vercel (état, cible de production).',
  },
  {
    name: VERCEL_TOOL_NAMES.domains,
    kind: 'lecture',
    permission: 'associe',
    touchesExterne: true,
    description: 'Liste les domaines rattachés à un projet Vercel.',
  },

  // --- Intégration factice (démonstration) ---
  {
    name: FAKE_TOOL_NAMES.activities,
    kind: 'lecture',
    permission: 'associe',
    touchesExterne: false, // aucun appel réseau réel : rien à journaliser
    description: 'Module factice : produit des activités de démonstration déterministes.',
  },
];

export function listTools(): ToolEntry[] {
  // Renvoie une copie : l'appelant ne doit pas pouvoir muter le registre.
  return toolsRegistry.map((entry) => ({ ...entry }));
}
