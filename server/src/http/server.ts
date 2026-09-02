// http/server.ts — assemblage de l'application Fastify.
//
// Décision d'architecture : deux CONTEXTES ENCAPSULÉS.
//   * Contexte public  : /api/health et /api/auth/login. Rien d'autre.
//   * Contexte protégé : le hook d'authentification est posé une seule fois
//     sur ce contexte ; toute route future enregistrée ici hérite
//     automatiquement de l'authentification — impossible d'oublier la
//     protection sur une nouvelle route.
//
// L'interface (React) ne connaît que cette API ; elle n'a aucun secret.

import cors from '@fastify/cors';
import Fastify, { type FastifyError, type FastifyInstance } from 'fastify';
import type pg from 'pg';
import { env } from '../config/env.js';
import { authenticate } from './auth.js';
import { registerPublicAuthRoutes, registerSessionRoutes } from './routes/auth.js';
import { registerDashboardRoutes } from './routes/dashboard.js';
import { registerClientRoutes } from './routes/clients.js';
import { registerProjectRoutes } from './routes/projets.js';
import { registerActivityRoutes } from './routes/activites.js';
import { registerSearchRoutes } from './routes/recherche.js';
import { registerJournalRoutes } from './routes/journal.js';
import { registerToolRoutes } from './routes/outils.js';
import { registerSyncRoutes } from './routes/sync.js';

export async function buildServer(pool: pg.Pool): Promise<FastifyInstance> {
  const app = Fastify({
    logger: { level: env.isProduction ? 'info' : 'warn' },
    // Derrière un reverse proxy (nginx/Caddy sur le VPS) : on fait confiance
    // aux en-têtes X-Forwarded-* fournis par notre propre proxy.
    trustProxy: true,
  });

  // CORS : origines explicites de l'interface + autorisation des cookies.
  await app.register(cors, {
    origin: env.webOrigins,
    credentials: true,
  });

  // ---- Contexte PUBLIC ---------------------------------------------------
  await app.register(async (publicApi) => {
    publicApi.get('/api/health', async () => ({
      status: 'ok',
      service: 'cockpit-server',
      lectureSeule: true,
    }));
    registerPublicAuthRoutes(publicApi, pool);
  });

  // ---- Contexte PROTÉGÉ (tout le reste) ----------------------------------
  await app.register(async (api) => {
    api.addHook('onRequest', authenticate);
    registerSessionRoutes(api, pool);
    registerDashboardRoutes(api, pool);
    registerClientRoutes(api, pool);
    registerProjectRoutes(api, pool);
    registerActivityRoutes(api, pool);
    registerSearchRoutes(api, pool);
    registerJournalRoutes(api, pool);
    registerToolRoutes(api, pool);
    registerSyncRoutes(api, pool);
  });

  // Présentation minimale sur la racine (évite les erreurs 404 brutales).
  app.get('/', async () => ({
    service: 'Cockpit — API de pilotage (socle V1, lecture seule)',
    documentation: 'Voir README.md pour la liste des routes.',
  }));

  // Erreurs uniformes : jamais de stack trace renvoyée au client.
  app.setErrorHandler((error: FastifyError, request, reply) => {
    request.log.error(error);
    const status = error.statusCode ?? 500;
    const message =
      status < 500 ? error.message : 'Erreur interne du serveur. Consultez le journal.';
    reply.code(status).send({
      error: { code: error.code ?? 'erreur_interne', message },
    });
  });

  return app;
}
