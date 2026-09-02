// http/routes/sync.ts — déclenchement manuel de la synchronisation.
//
// La V1 est "lecture seule" vis-à-vis des SYSTÈMES EXTERNES : ce point
// d'entrée n'écrit que dans la base interne (activites, metadata, journal).
// Il permet de remplir le tableau de bord à la demande sans attendre le
// cron, et de vérifier la santé des branchements (chaque détail de l'échec
// est remonté). L'appel est tracé : la ligne utilisateur du journal porte
// l'email de l'associé qui a déclenché le passage.

import type { FastifyInstance } from 'fastify';
import type pg from 'pg';
import { syncAll } from '../../jobs/sync-activities.js';
import { requireAggregateIntention } from '../../orchestration/permissions.js';
import { httpError } from '../helpers.js';

export function registerSyncRoutes(app: FastifyInstance, pool: pg.Pool): void {
  app.post('/api/sync/run', async (request, reply) => {
    try {
      requireAggregateIntention('sync');
    } catch (error) {
      return httpError(reply, 403, 'intention_manquante', (error as Error).message);
    }

    try {
      const summary = await syncAll(pool, request.user.email);
      return reply.send(summary);
    } catch (error) {
      return httpError(
        reply,
        500,
        'sync_echoue',
        `La synchronisation a échoué : ${error instanceof Error ? error.message : String(error)}`
      );
    }
  });
}
