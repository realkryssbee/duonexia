// http/routes/dashboard.ts — le tableau de bord d'accueil (V1).
//
// C'est l'un des rares points d'AGRÉGATION multi-clients du système : il
// représente l'"intention explicite" des deux associés de voir l'ensemble du
// portefeuille. La permission est vérifiée par requireAggregateIntention
// avant tout calcul.

import type { FastifyInstance } from 'fastify';
import type pg from 'pg';
import { requireAggregateIntention } from '../../orchestration/permissions.js';
import {
  listActiveProjects,
  listInactiveProjects,
  listPendingInvoices,
  listRecentActivities,
  listUpcomingDeadlines,
} from '../../db/queries.js';
import { httpError } from '../helpers.js';

export function registerDashboardRoutes(app: FastifyInstance, pool: pg.Pool): void {
  app.get('/api/dashboard', async (_request, reply) => {
    try {
      requireAggregateIntention('dashboard');
    } catch (error) {
      return httpError(reply, 403, 'intention_manquante', (error as Error).message);
    }

    const [projetsActifs, projetsInactifs, echeancesProches, facturesEnAttente, flux48h] =
      await Promise.all([
        listActiveProjects(pool),
        listInactiveProjects(pool),
        listUpcomingDeadlines(pool),
        listPendingInvoices(pool),
        listRecentActivities(pool, 200),
      ]);

    return reply.send({
      produitLe: new Date().toISOString(),
      projetsActifs,
      alertes: {
        // Inactifs depuis plus de 14 jours (jours > 0).
        projetsInactifs,
        // Échéances dans les 7 jours, y compris dépassées (jours <= 0).
        echeancesProches,
        // Reste à facturer > 0.
        facturesEnAttente,
      },
      // Flux consolidé des 48 dernières heures.
      flux48h,
    });
  });
}
