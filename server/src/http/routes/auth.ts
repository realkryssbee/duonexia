// http/routes/auth.ts — connexion / déconnexion / session courante.
//
// registerPublicAuthRoutes : la connexion est PUBLIQUE (contexte non
// authentifié) — c'est le point d'entrée unique vers une session.
// registerSessionRoutes : déconnexion et session courante, PROTÉGÉES comme
// le reste de l'API (le hook d'authentification est posé par le serveur).

import type { FastifyInstance } from 'fastify';
import type pg from 'pg';
import {
  clearSessionCookie,
  setSessionCookie,
  verifyCredentials,
} from '../auth.js';
import { httpError } from '../helpers.js';

export function registerPublicAuthRoutes(app: FastifyInstance, _pool: pg.Pool): void {
  app.post('/api/auth/login', async (request, reply) => {
    const body = request.body as { email?: unknown; password?: unknown } | null;
    const email = typeof body?.email === 'string' ? body.email : '';
    const password = typeof body?.password === 'string' ? body.password : '';
    if (email === '' || password === '') {
      return httpError(reply, 400, 'champs_manquants', 'email et mot de passe requis.');
    }

    const verifiedEmail = verifyCredentials(email, password);
    if (!verifiedEmail) {
      // Message volontairement neutre : ne pas révéler si l'email existe.
      return httpError(reply, 401, 'identifiants_invalides', 'Email ou mot de passe incorrect.');
    }

    setSessionCookie(reply, verifiedEmail);
    return reply.send({ email: verifiedEmail });
  });
}

export function registerSessionRoutes(app: FastifyInstance, _pool: pg.Pool): void {
  app.get('/api/me', async (request, reply) => {
    return reply.send({ email: request.user.email });
  });

  app.post('/api/auth/logout', async (_request, reply) => {
    clearSessionCookie(reply);
    return reply.send({ ok: true });
  });
}
