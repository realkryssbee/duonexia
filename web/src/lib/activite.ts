// lib/activite.ts — transformation d'une activité en texte lisible.
// Le payload est un Record<string, unknown> : on ne lit JAMAIS une clé sans
// vérifier son type (la donnée vient de systèmes externes = non fiable).

import type { Activite } from '../types';

function texte(payload: Record<string, unknown> | null, clef: string): string | null {
  const valeur = payload?.[clef];
  return typeof valeur === 'string' && valeur !== '' ? valeur : null;
}

/** Renvoie le message affichable d'une activité, selon son type. */
export function messageActivite(activite: Activite): string {
  const payload = activite.payload;
  switch (activite.type) {
    case 'commit':
      return texte(payload, 'message') ?? 'Commit sans message';
    case 'pull_request':
      return `PR ${texte(payload, 'title') ?? ''}`.trim();
    case 'deployment': {
      const environnement = texte(payload, 'environnement') ?? 'production';
      const etat = texte(payload, 'etat') ?? 'inconnu';
      return `Déploiement ${environnement} — ${etat}`;
    }
    case 'issue':
      return `Issue : ${texte(payload, 'title') ?? ''}`.trim();
    case 'alerte':
      return texte(payload, 'texte') ?? texte(payload, 'message') ?? 'Alerte';
    case 'manuel':
      return texte(payload, 'texte') ?? 'Note manuelle';
    default:
      return `Événement ${activite.type}`;
  }
}

/** URL externe associée à une activité (commit, PR, déploiement), si connue. */
export function urlActivite(activite: Activite): string | null {
  return texte(activite.payload, 'url');
}
