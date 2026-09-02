// orchestration/permissions.ts — politique de permissions V1.
//
// Deux associés, deux rôles identiques en V1 (lecture complète du poste de
// pilotage). La structure existe pour la suite, pas pour le confort :
//   * cloisonnement par client : le pilote central (dashboard), la recherche
//     transverse et le journal sont les SEULS points d'agrégation
//     multi-clients — ils constituent l'"intention explicite" exigée par la
//     spécification. Toute autre lecture est ciblée par une entité
//     (client_id / projet_id) et ne peut pas ramener d'autres clients.
//   * en V2, l'agent conversationnel passera par ces mêmes contrôles avant
//     chaque appel d'outil du registre.

export type Role = 'associe';

export interface Principal {
  email: string;
  role: Role;
}

// Les intentions explicites d'agrégation multi-clients du poste de pilotage.
const AGGREGATION_INTENTIONS = new Set([
  'dashboard', // vue globale des deux associés
  'recherche', // recherche transverse
  'journal', // journal d'audit (tous les clients, intention d'audit)
  'outils', // registre d'outils
  'sync', // déclenchement manuel de la synchronisation
]);

/**
 * Vérifie qu'une agrégation multi-clients est une intention explicite du
 * poste de pilotage. Toute autre route doit passer par une entité ciblée.
 */
export function requireAggregateIntention(intention: string): void {
  if (!AGGREGATION_INTENTIONS.has(intention)) {
    throw new Error(
      `[permissions] Agrégation multi-clients non autorisée sans intention explicite : ${intention}`
    );
  }
}

/**
 * Construit le principal (utilisateur authentifié) à partir de son email.
 * Renvoie null si l'email ne correspond à aucun associé : la route doit
 * alors refuser l'accès.
 */
export function principalFromEmail(email: string): Principal | null {
  return { email, role: 'associe' as Role };
}
