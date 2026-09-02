// config/env.ts — chargement et validation de l'environnement.
//
// Décision d'architecture : un secret manquant ou malformé fait échouer le
// démarrage. On préfère un serveur qui refuse de s'éveiller plutôt qu'un
// serveur qui tourne sans protection (c'est un poste de pilotage qui agrège
// des données d'huissiers et de paie).
// Les variables "V2" (clés de modèles) sont optionnelles : la V1 est en
// lecture seule et n'appelle aucun modèle.

import 'dotenv/config';

function read(name: string): string {
  return (process.env[name] ?? '').trim();
}

function required(name: string): string {
  const value = read(name);
  if (!value) {
    throw new Error(
      `[config] Variable d'environnement manquante : ${name}. ` +
        `Copiez server/.env.example vers server/.env et renseignez-la.`
    );
  }
  return value;
}

function optional(name: string, fallback: string): string {
  const value = read(name);
  return value === '' ? fallback : value;
}

function optionalInt(name: string, fallback: number): number {
  const value = read(name);
  if (value === '') return fallback;
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error(`[config] ${name} doit être un entier positif (reçu : ${value}).`);
  }
  return parsed;
}

export interface CockpitUser {
  email: string;
  password: string;
}

// COCKPIT_USERS = "a@duonexia.be:motdepasse;b@duonexia.be:motdepasse"
function parseUsers(raw: string): CockpitUser[] {
  const users = raw
    .split(';')
    .map((part) => part.trim())
    .filter((part) => part !== '')
    .map((part) => {
      const separator = part.indexOf(':');
      if (separator <= 0 || separator === part.length - 1) {
        throw new Error(
          `[config] COCKPIT_USERS invalide : attendu "email:motdepasse" séparé par ';' (reçu : ${part}).`
        );
      }
      return {
        email: part.slice(0, separator).trim().toLowerCase(),
        password: part.slice(separator + 1),
      };
    });

  if (users.length === 0) {
    throw new Error('[config] COCKPIT_USERS ne contient aucun compte.');
  }
  return users;
}

function parseOrigins(raw: string): string[] {
  return raw
    .split(',')
    .map((origin) => origin.trim())
    .filter((origin) => origin !== '');
}

const nodeEnv = optional('NODE_ENV', 'development');
const sessionSecret = required('COCKPIT_SESSION_SECRET');
if (sessionSecret.length < 24) {
  throw new Error('[config] COCKPIT_SESSION_SECRET doit faire au moins 24 caractères.');
}

const pgSslMode = optional('PGSSLMODE', 'require');
if (!['require', 'verify-full', 'disable'].includes(pgSslMode)) {
  throw new Error(`[config] PGSSLMODE invalide : ${pgSslMode} (require | verify-full | disable).`);
}

// SameSite du cookie de session. 'none' n'est utile qu'en test lorsque le
// front (ex. *.vercel.app) et l'API (ex. tunnel HTTPS) sont sur des SITES
// différents ; en production nominale (même domaine racine) on garde 'lax'.
const cookieSameSite = optional('COOKIE_SAMESITE', 'lax').toLowerCase();
if (!['lax', 'none'].includes(cookieSameSite)) {
  throw new Error(`[config] COOKIE_SAMESITE invalide : ${cookieSameSite} (lax | none).`);
}

export const env = {
  nodeEnv,
  isProduction: nodeEnv === 'production',

  // Serveur HTTP
  port: optionalInt('PORT', 4000),
  host: optional('HOST', '0.0.0.0'),

  // Base de données
  databaseUrl: required('DATABASE_URL'),
  pgSslMode: pgSslMode as 'require' | 'verify-full' | 'disable',

  // Authentification de l'interface
  users: parseUsers(required('COCKPIT_USERS')),
  sessionSecret,
  sessionTtlHours: optionalInt('SESSION_TTL_HOURS', 12),
  cookieSecure: optional('COOKIE_SECURE', 'false') === 'true',
  cookieSameSite: cookieSameSite as 'lax' | 'none',
  webOrigins: parseOrigins(optional('WEB_ORIGINS', 'http://localhost:5173')),

  // Synchronisation planifiée
  runJobs: optional('RUN_JOBS', 'false') === 'true',
  syncCron: optional('SYNC_CRON', '*/15 * * * *'),
  syncLookbackDays: optionalInt('SYNC_LOOKBACK_DAYS', 30),

  // Intégrations — lecture seule (jetons optionnels : sans jeton, le module
  // correspondant est proprement ignoré par le job de synchronisation)
  githubToken: read('GITHUB_TOKEN') || null,
  githubApiUrl: optional('GITHUB_API_URL', 'https://api.github.com'),
  vercelToken: read('VERCEL_TOKEN') || null,
  vercelApiUrl: optional('VERCEL_API_URL', 'https://api.vercel.com'),
  vercelTeamId: read('VERCEL_TEAM_ID') || null,

  // ModelRouter — réservé à la V2 ; l'URL DeepSeek UE reste vide tant que le
  // fournisseur d'inférence européen n'est pas choisi (voir README, § RGPD)
  anthropicApiKey: read('ANTHROPIC_API_KEY') || null,
  anthropicApiUrl: optional('ANTHROPIC_API_URL', 'https://api.anthropic.com'),
  anthropicModel: optional('ANTHROPIC_MODEL', 'claude-sonnet-4-5'),
  deepseekEuBaseUrl: read('DEEPSEEK_EU_BASE_URL') || null,
  deepseekEuApiKey: read('DEEPSEEK_EU_API_KEY') || null,
  deepseekEuModel: optional('DEEPSEEK_EU_MODEL', 'deepseek-chat'),
} as const;

if (!env.isProduction && env.cookieSecure) {
  console.warn('[config] COOKIE_SECURE=true en développement local : les cookies ne passeront pas en HTTP. Mettez false en dev.');
}
