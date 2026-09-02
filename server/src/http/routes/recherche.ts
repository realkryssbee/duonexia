// http/routes/recherche.ts — la recherche transverse.
//
// Une barre unique traverse clients, projets et activités. C'est la DEUXIÈME
// intention explicite d'agrégation multi-clients (avec le dashboard) : la
// permission est vérifiée avant la requête. La recherche est volontairement
// simple en V1 (LIKE insensible à la casse) : le volume est minuscule.
// Si elle devient lente : index pg_trgm (voir README).

import type { FastifyInstance } from 'fastify';
import type pg from 'pg';
import { searchAcross } from '../../db/queries.js';
import { requireAggregateIntention } from '../../orchestration/permissions.js';
import { httpError, parseLimit } from '../helpers.js';

export function registerSearchRoutes(app: FastifyInstance, pool: pg.Pool): void {
  app.get('/api/recherche', async (request, reply) => {
    try {
      requireAggregateIntention('recherche');
    } catch (error) {
      return httpError(reply, 403, 'intention_manquante', (error as Error).message);
    }

    const query = request.query as Record<string, unknown>;
    const q = typeof query.q === 'string' ? query.q.trim() : '';
    if (q.length < 2) {
      return httpError(reply, 400, 'requete_trop_courte', 'La recherche exige au moins 2 caractères.');
    }

    const limit = parseLimit(query.limit, 10, 25);
    const results = await searchAcross(pool, q, limit);

    return reply.send({
      requete: q,
      ...results,
      nombre: {
        clients: results.clients.length,
        projets: results.projets.length,
        activites: results.activites.length,
      },
    });
  });
}
