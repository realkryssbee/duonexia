// http/routes/projets.ts — vues projet (lecture seule).
//
// CLOISONNEMENT : le listing /api/projets exige client_id — aucune requête
// ne peut ramener des projets de plusieurs clients sans passer par les
// intentions explicites (dashboard, recherche). Le détail et ses
// sous-ressources (activités, intégrations) sont ciblés par id.

import type { FastifyInstance } from 'fastify';
import type pg from 'pg';
import {
  getProject,
  listProjectActivities,
  listProjectIntegrations,
  listProjects,
} from '../../db/queries.js';
import { httpError, isValidUuid, parseLimit, parseQueryString } from '../helpers.js';

export function registerProjectRoutes(app: FastifyInstance, pool: pg.Pool): void {
  // Projets d'UN client (filtres statut / vertical optionnels).
  app.get('/api/projets', async (request, reply) => {
    const query = request.query as Record<string, unknown>;
    const clientId = parseQueryString(query.client_id);
    if (!clientId) {
      return httpError(
        reply,
        400,
        'client_id_requis',
        'Le listing des projets exige client_id (cloisonnement par client). Pour une vue globale, utilisez /api/dashboard ou /api/recherche.'
      );
    }
    const projets = await listProjects(pool, {
      clientId,
      statut: parseQueryString(query.statut),
      vertical: parseQueryString(query.vertical),
    });
    return reply.send({ projets });
  });

  // Fiche projet complète : données + client + branchements externes.
  app.get('/api/projets/:id', async (request, reply) => {
    const params = request.params as { id?: string };
    if (!params.id || !isValidUuid(params.id)) {
      return httpError(reply, 400, 'id_invalide', 'Identifiant projet invalide.');
    }

    const projet = await getProject(pool, params.id);
    if (!projet) {
      return httpError(reply, 404, 'projet_introuvable', 'Projet introuvable.');
    }

    const integrations = await listProjectIntegrations(pool, params.id);
    const resteAFacturer = projet.montant_contractualise - projet.montant_facture;

    return reply.send({
      projet,
      integrations,
      etatFinancier: {
        contractualise: projet.montant_contractualise,
        facture: projet.montant_facture,
        resteAFacturer,
        factureComplete: resteAFacturer <= 0.005, // tolérance flottants
      },
    });
  });

  // Activité chronologique d'un projet.
  app.get('/api/projets/:id/activites', async (request, reply) => {
    const params = request.params as { id?: string };
    if (!params.id || !isValidUuid(params.id)) {
      return httpError(reply, 400, 'id_invalide', 'Identifiant projet invalide.');
    }
    const limit = parseLimit((request.query as Record<string, unknown>).limit, 100, 500);
    const activites = await listProjectActivities(pool, params.id, { limit });
    return reply.send({ activites });
  });

  // Branchements externes d'un projet (avec leur dernier aperçu metadata).
  app.get('/api/projets/:id/integrations', async (request, reply) => {
    const params = request.params as { id?: string };
    if (!params.id || !isValidUuid(params.id)) {
      return httpError(reply, 400, 'id_invalide', 'Identifiant projet invalide.');
    }
    const integrations = await listProjectIntegrations(pool, params.id);
    return reply.send({ integrations });
  });
}
