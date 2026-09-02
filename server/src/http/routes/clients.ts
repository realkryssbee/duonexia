// http/routes/clients.ts — registre des clients et vue client.
//
// Le listing sans filtre est le registre lui-même (les deux associés
// connaissent leurs clients) ; la VUE CLIENT (détail) est ciblée par id et
// ramène les projets et l'historique d'UN SEUL client : le cloisonnement
// multi-clients s'applique aux données de projets, pas au carnet d'adresses.

import type { FastifyInstance } from 'fastify';
import type pg from 'pg';
import {
  getClient,
  listClientActivities,
  listClients,
  listProjects,
} from '../../db/queries.js';
import { httpError, isValidUuid, parseQueryString } from '../helpers.js';

export function registerClientRoutes(app: FastifyInstance, pool: pg.Pool): void {
  // Registre des clients (filtres optionnels vertical / statut).
  app.get('/api/clients', async (request, reply) => {
    const query = request.query as Record<string, unknown>;
    const clients = await listClients(pool, {
      vertical: parseQueryString(query.vertical),
      statut: parseQueryString(query.statut),
    });
    return reply.send({ clients });
  });

  // Vue client : fiche + projets associés + historique d'activité.
  app.get('/api/clients/:id', async (request, reply) => {
    const params = request.params as { id?: string };
    if (!params.id || !isValidUuid(params.id)) {
      return httpError(reply, 400, 'id_invalide', 'Identifiant client invalide.');
    }

    const client = await getClient(pool, params.id);
    if (!client) {
      return httpError(reply, 404, 'client_introuvable', 'Client introuvable.');
    }

    // Agrégation bornée à un seul client : c'est l'intention de la vue.
    const [projets, historique] = await Promise.all([
      listProjects(pool, { clientId: params.id }),
      listClientActivities(pool, params.id, 30),
    ]);

    // Synthèse d'engagement (affichage) : nb de projets vivants et volumes.
    const enCours = projets.filter((projet) => projet.statut !== 'termine' && projet.statut !== 'archive');
    const engagement = {
      projetsVivants: enCours.length,
      contractualiseVivant: enCours.reduce((somme, projet) => somme + projet.montant_contractualise, 0),
      factureVivant: enCours.reduce((somme, projet) => somme + projet.montant_facture, 0),
    };

    return reply.send({ client, projets, historique, engagement });
  });
}
