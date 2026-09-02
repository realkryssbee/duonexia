// http/routes/journal.ts — consultation du journal d'audit.
//
// Troisième intention explicite : lire le journal, c'est auditer l'ensemble
// des appels d'outils de tous les clients. Réservé aux associés (tout le
// monde ici), utile pour vérifier que la journalisation fonctionne :
// GET /api/journal?outil=github.commits&limit=50

import type { FastifyInstance } from 'fastify';
import type pg from 'pg';
import { listJournalEntries } from '../../db/queries.js';
import { requireAggregateIntention } from '../../orchestration/permissions.js';
import { httpError, parseLimit, parseQueryString } from '../helpers.js';

export function registerJournalRoutes(app: FastifyInstance, pool: pg.Pool): void {
  app.get('/api/journal', async (request, reply) => {
    try {
      requireAggregateIntention('journal');
    } catch (error) {
      return httpError(reply, 403, 'intention_manquante', (error as Error).message);
    }

    const query = request.query as Record<string, unknown>;
    const entrees = await listJournalEntries(pool, {
      limit: parseLimit(query.limit, 100, 500),
      outil: parseQueryString(query.outil),
    });
    return reply.send({ entrees });
  });
}
