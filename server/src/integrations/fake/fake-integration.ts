// integrations/fake/fake-integration.ts — LE MODULE FACTICE.
//
// Objectif : prouver que l'interface commune tient. Cette intégration ne
// touche aucun système externe : elle produit des activités de démonstration
// déterministes (offsets fixes par rapport à l'instant présent) qui font
// vivre le tableau de bord et le flux 48 h SANS aucun jeton réel. Elle suit
// exactement le même contrat que GitHub ou Vercel : la synchronisation, le
// registre d'outils et le cloisonnement par projet ne font aucune différence.
//
// Le jeu de données 0002_seed_demo.sql crée deux intégrations de type 'fake'
// pour qu'un environnement fraîchement migré montre immédiatement du flux.

import type {
  IntegrationService,
  IntegrationTarget,
  RawActivity,
} from '../integration.js';

// Décale un événement de N heures dans le passé (déterministe par exécution).
function hoursAgo(hours: number): Date {
  return new Date(Date.now() - hours * 3_600_000);
}

export class FakeIntegration implements IntegrationService {
  readonly type = 'fake';
  readonly label = 'Démonstration (aucun système externe)';

  async fetchActivities(
    target: IntegrationTarget,
    _options: { since: Date }
  ): Promise<RawActivity[]> {
    const prefix = target.identifiantExterne;
    return [
      {
        externalId: `${prefix}-commit-recent`,
        type: 'commit',
        payload: {
          sha: `${prefix}-sha-recent`,
          message: 'feat(demo) : mise à jour du flux de démonstration',
          auteur: { nom: 'Associé (démo)', email: 'demo@duonexia.be' },
          url: null,
        },
        horodatage: hoursAgo(1),
      },
      {
        externalId: `${prefix}-deploy-preview`,
        type: 'deployment',
        payload: {
          deploymentId: `${prefix}-dep-1`,
          url: `https://${prefix}-preview.vercel.app`,
          environnement: 'preview',
          etat: 'READY',
        },
        horodatage: hoursAgo(3),
      },
      {
        externalId: `${prefix}-commit-hier`,
        type: 'commit',
        payload: {
          sha: `${prefix}-sha-hier`,
          message: 'fix(demo) : correction d\'un libellé dans l\'interface',
          auteur: { nom: 'Associé (démo)', email: 'demo@duonexia.be' },
          url: null,
        },
        horodatage: hoursAgo(26),
      },
    ];
  }

  async fetchProjectMetadata(target: IntegrationTarget): Promise<Record<string, unknown>> {
    // Prouve le flux "aperçu -> integrations.metadata" sans réseau.
    return {
      pulledAt: new Date().toISOString(),
      demo: true,
      note: `Aperçu factice pour ${target.identifiantExterne} : aucune donnée externe réelle.`,
    };
  }
}
