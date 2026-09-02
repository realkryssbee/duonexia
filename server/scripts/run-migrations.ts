// scripts/run-migrations.ts — application des migrations SQL dans l'ordre.
//
// Usage : depuis server/, `npm run db:migrate` (les variables viennent de
// server/.env grâce à dotenv). Les migrations ciblent la base Supabase
// (distante) : on peut les lancer depuis n'importe quelle machine ; le
// serveur du VPS n'a pas besoin de les rejouer.
//
// Chaque fichier est appliqué DANS une transaction et enregistré dans
// schema_migrations : relancer le script est sans effet (idempotent).

import 'dotenv/config';
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

const migrationsDir = fileURLToPath(new URL('../../db/migrations/', import.meta.url));

async function main(): Promise<void> {
  const databaseUrl = process.env.DATABASE_URL ?? '';
  if (databaseUrl === '') {
    console.error('[migrate] DATABASE_URL manquante (server/.env).');
    process.exit(1);
  }

  const sslMode = process.env.PGSSLMODE ?? 'require';
  const ssl =
    sslMode === 'disable'
      ? false
      : { rejectUnauthorized: sslMode === 'verify-full' };

  const pool = new pg.Pool({ connectionString: databaseUrl, ssl });

  try {
    await pool.query(
      `create table if not exists schema_migrations (
         nom text primary key,
         appliquee_le timestamptz not null default now()
       )`
    );

    const appliedRows = await pool.query('select nom from schema_migrations');
    const applied = new Set<string>(appliedRows.rows.map((row) => row.nom));

    const files = (await readdir(migrationsDir))
      .filter((file) => file.endsWith('.sql'))
      .sort();

    if (files.length === 0) {
      console.warn('[migrate] Aucun fichier SQL dans db/migrations/.');
    }

    for (const file of files) {
      if (applied.has(file)) {
        console.info(`[migrate] déjà appliquée, ignorée : ${file}`);
        continue;
      }
      // migrationsDir est un chemin de fichiers système (fileURLToPath) :
      // on joint avec path, jamais avec new URL.
      const sql = await readFile(path.join(migrationsDir, file), 'utf8');

      const client = await pool.connect();
      try {
        await client.query('begin');
        await client.query(sql);
        await client.query('insert into schema_migrations (nom) values ($1)', [file]);
        await client.query('commit');
        console.info(`[migrate] appliquée : ${file}`);
      } catch (error) {
        await client.query('rollback');
        console.error(`[migrate] ÉCHEC sur ${file} (transaction annulée) :`, error);
        process.exit(1);
      } finally {
        client.release();
      }
    }
  } finally {
    await pool.end();
  }
}

main().catch((error) => {
  console.error('[migrate] Échec :', error);
  process.exit(1);
});
