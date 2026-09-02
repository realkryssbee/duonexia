// http/helpers.ts — petits utilitaires partagés par les routes HTTP :
// réponses d'erreur uniformes et validation des paramètres.

import type { FastifyReply } from 'fastify';

/** Réponse d'erreur uniforme : { error: { code, message } }. */
export function httpError(
  reply: FastifyReply,
  status: number,
  code: string,
  message: string
): FastifyReply {
  return reply.code(status).send({ error: { code, message } });
}

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isValidUuid(value: string): boolean {
  return UUID_PATTERN.test(value);
}

/** Parse une limite de pagination (défaut 100, plafond 500). */
export function parseLimit(raw: unknown, fallback = 100, max = 500): number {
  if (raw === undefined || raw === null || raw === '') return fallback;
  const parsed = Number.parseInt(String(raw), 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return Math.min(parsed, max);
}

/** Parse un paramètre de requête texte optionnel. */
export function parseQueryString(raw: unknown): string | undefined {
  if (typeof raw !== 'string') return undefined;
  const trimmed = raw.trim();
  return trimmed === '' ? undefined : trimmed;
}

/** Parse une date ISO optionnelle ; renvoie null si invalide. */
export function parseIsoDate(raw: unknown): Date | null {
  if (typeof raw !== 'string' || raw.trim() === '') return null;
  const date = new Date(raw);
  return Number.isNaN(date.getTime()) ? null : date;
}
