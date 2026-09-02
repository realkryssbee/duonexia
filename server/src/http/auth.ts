// http/auth.ts — authentification de l'interface par cookie de session signé.
//
// Pourquoi pas un jeton Bearer côté navigateur ? Un jeton stocké dans le
// bundle Vercel ou le localStorage serait un "secret côté client", interdit
// par la spécification. On utilise donc une session HttpOnly : les associés
// saisissent email + mot de passe sur la page de connexion (HTTPS), le
// serveur répond un cookie signé HMAC que le navigateur renvoie tout seul.
// Le cookie n'est pas lisible par JavaScript (HttpOnly) et expire.
//
// La signature HMAC (crypto natif, zéro dépendance) suffit pour deux
// utilisateurs internes : pas de base d'utilisateurs, pas de refresh token.

import crypto from 'node:crypto';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { env } from '../config/env.js';

// Augmentation de type : une fois passé le hook d'authentification,
// request.user est garanti non nul.
declare module 'fastify' {
  interface FastifyRequest {
    user: { email: string };
  }
}

export const SESSION_COOKIE_NAME = 'cockpit_session';

// Les mots de passe ne sont jamais comparés en clair : on compare des
// empreintes SHA-256 en temps constant (timingSafeEqual).
function hash(password: string): Buffer {
  return crypto.createHash('sha256').update(password).digest();
}

/** Vérifie les identifiants ; renvoie l'email canonique ou null. */
export function verifyCredentials(emailRaw: string, password: string): string | null {
  const email = emailRaw.trim().toLowerCase();
  const user = env.users.find((candidate) => candidate.email === email);
  if (!user) return null;
  const expected = hash(user.password);
  const provided = hash(password);
  const valid =
    expected.length === provided.length && crypto.timingSafeEqual(expected, provided);
  return valid ? email : null;
}

interface SessionPayload {
  email: string;
  exp: number; // timestamp d'expiration (ms)
}

function signPayload(payload: SessionPayload): string {
  const data = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const signature = crypto.createHmac('sha256', env.sessionSecret).update(data).digest('base64url');
  return `${data}.${signature}`;
}

/** Crée un jeton de session pour l'email donné (durée : SESSION_TTL_HOURS). */
export function createSessionToken(email: string): string {
  return signPayload({ email, exp: Date.now() + env.sessionTtlHours * 3_600_000 });
}

/** Lit et vérifie le cookie de session ; renvoie l'email ou null. */
export function readSessionFromCookie(cookieHeader: string | undefined): { email: string } | null {
  if (!cookieHeader) return null;
  const cookie = cookieHeader
    .split(';')
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${SESSION_COOKIE_NAME}=`));
  if (!cookie) return null;

  const token = cookie.slice(SESSION_COOKIE_NAME.length + 1);
  const [data, signature] = token.split('.');
  if (!data || !signature) return null;

  const expected = crypto
    .createHmac('sha256', env.sessionSecret)
    .update(data)
    .digest('base64url');
  const signatureMatches =
    expected.length === signature.length && crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(signature));
  if (!signatureMatches) return null;

  try {
    const payload = JSON.parse(Buffer.from(data, 'base64url').toString('utf8')) as SessionPayload;
    if (typeof payload.exp !== 'number' || payload.exp < Date.now()) return null;
    // Le compte doit toujours exister (un retrait de COCKPIT_USERS ferme les
    // sessions existantes au prochain appel).
    if (!env.users.some((user) => user.email === payload.email)) return null;
    return { email: payload.email };
  } catch {
    return null;
  }
}

export function setSessionCookie(reply: FastifyReply, email: string): void {
  const token = createSessionToken(email);
  // SameSite=none impose Secure (les navigateurs refusent None sans HTTPS).
  const secure = env.isProduction || env.cookieSecure || env.cookieSameSite === 'none' ? '; Secure' : '';
  reply.header(
    'set-cookie',
    `${SESSION_COOKIE_NAME}=${token}; Path=/; HttpOnly; SameSite=${env.cookieSameSite}; Max-Age=${env.sessionTtlHours * 3600}${secure}`
  );
}

export function clearSessionCookie(reply: FastifyReply): void {
  reply.header(
    'set-cookie',
    `${SESSION_COOKIE_NAME}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`
  );
}

/**
 * Hook onRequest des routes protégées : sans session valide, 401.
 * Ce hook n'est enregistré QUE sur le contexte encapsulé des routes
 * protégées (voir http/server.ts) : la page de connexion reste publique.
 */
export async function authenticate(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<FastifyReply | undefined> {
  const session = readSessionFromCookie(request.headers.cookie);
  if (!session) {
    reply.code(401).send({
      error: { code: 'non_authentifie', message: 'Session requise. Connectez-vous.' },
    });
    return reply;
  }
  request.user = session;
  return undefined;
}
