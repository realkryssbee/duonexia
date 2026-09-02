// http/routes/activites.ts — flux d'activité ciblé.
//
// Le flux GLOBAL (toutes activités, tous clients) n'existe qu'à travers le
// tableau de bord (48 h) et la recherche transverse : intentions explicites.
// Cette route est toujours ciblée sur un projet.

import type { FastifyInstance } from 'fastify';
import type pg from 'pg';
import { listProjectActivities } from '../../db/queries.js';
import { httpError, isValidUuid, parseIsoDate, parseLimit, parseQueryString } from '../helpers.js';

export function registerActivityRoutes(app: FastifyInstance, pool: pg.Pool): void {
  app.get('/api/activites', async (request, reply) => {
    const query = request.query as Record<string, unknown>;
    const projetId = parseQueryString(query.projet_id);
    if (!projetId || !isValidUuid(projetId)) {
      return httpError(
        reply,
        400,
        'projet_id_requis',
        'Cette route exige projet_id (uuid) : le flux global passe par /api/dashboard.'
      );
    }

    // Filtre temporel optionnel (ex. ?depuis=2026-01-01T00:00:00Z)
    const since = parseIsoDate(query.depuis);
    if (query.depuis !== undefined && since === null) {
      return httpError(reply, 400, 'date_invalide', 'Paramètre "depuis" invalide (ISO 8601 attendu).');
    }

    const limit = parseLimit(query.limit, 100, 500);
    const activites = await listProjectActivities(pool, projetId, { limit });
    const filtrées = since ? activites.filter((activite) => activite.horodatage >= since) : activites;

    return reply.send({ activites: filtrées, nombre: filtrées.length });
  });
}
