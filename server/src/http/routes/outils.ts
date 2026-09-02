// http/routes/outils.ts — exposition du registre d'outils.
//
// L'orchestrateur expose son registre : c'est la preuve visible que la V2
// (agent) puisera ses capacités dans une liste contrôlée, et que chaque nom
// correspond à une entrée du journal.

import type { FastifyInstance } from 'fastify';
import type pg from 'pg';
import { listTools } from '../../orchestration/registry.js';
import { requireAggregateIntention } from '../../orchestration/permissions.js';
import { httpError } from '../helpers.js';

export function registerToolRoutes(app: FastifyInstance, _pool: pg.Pool): void {
  app.get('/api/outils', async (_request, reply) => {
    try {
      requireAggregateIntention('outils');
    } catch (error) {
      return httpError(reply, 403, 'intention_manquante', (error as Error).message);
    }
    return reply.send({ outils: listTools() });
  });
}
