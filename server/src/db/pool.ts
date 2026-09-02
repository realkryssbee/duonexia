// db/pool.ts — pool de connexions Postgres.
//
// Décision : accès à Supabase via le driver pg (node-postgres) plutôt que le
// client @supabase/supabase-js. Supabase est utilisé comme un Postgres managé
// et le tableau de bord repose sur des agrégats SQL que le driver direct
// exprime sans détour ni couche REST intermédiaire.

import pg from 'pg';

export type SslMode = 'require' | 'verify-full' | 'disable';

export function createPool(databaseUrl: string, sslMode: SslMode): pg.Pool {
  // Supabase impose SSL ; le mode "require" ne vérifie pas la chaîne du
  // certificat (suffisant pour un outil interne), "verify-full" le fait.
  const ssl =
    sslMode === 'disable'
      ? false
      : { rejectUnauthorized: sslMode === 'verify-full' };

  return new pg.Pool({
    connectionString: databaseUrl,
    ssl,
    // Outil interne à deux utilisateurs : un petit pool suffit largement.
    max: 5,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 10_000,
  });
}
