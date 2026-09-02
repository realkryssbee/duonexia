// scripts/run-migrations.ts — application des migrations SQL dans l'ordre,
// et optionnellement des SEEDS de démonstration (uniquement en dev).
//
// Usage (depuis server/, variables via server/.env ou l'environnement) :
//   npm run db:migrate    -> applique db/migrations/*.sql  (schéma réel)
//   npm run db:seed       -> applique db/seeds/*.sql       (données démo, JAMAIS en prod)
//
// Décision : le seed de démonstration ne vit PAS dans db/migrations — une
// base réelle ne doit jamais recevoir de données factices par accident lors
// d'un `npm run db:migrate`. Chaque fichier est appliqué DANS une
// transaction et enregistré dans schema_migrations : relancer est sans
// effet (idempotent). Les migrations ciblent la base Supabase (distante) :
// on peut les lancer depuis n'importe quelle machine.

import 'dotenv/config';
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

// --seed : mode démonstration (db/seeds), sinon migrations (db/migrations).
const mode = process.argv.includes('--seed') ? 'seed' : 'migrate';
const dbDir = fileURLToPath(
  new URL(`../../db/${mode === 'seed' ? 'seeds' : 'migrations'}/`, import.meta.url)
);

async function main(): Promise<void> {
  const databaseUrl = process.env.DATABASE_URL ?? '';
  if (databaseUrl === '') {
    console.error(`[${mode}] DATABASE_URL manquante (server/.env).`);
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

    const files = (await readdir(dbDir))
      .filter((file) => file.endsWith('.sql'))
      .sort();

    if (files.length === 0) {
      console.warn(`[${mode}] Aucun fichier SQL dans db/${mode === 'seed' ? 'seeds' : 'migrations'}/.`);
    }

    for (const file of files) {
      if (applied.has(file)) {
        console.info(`[${mode}] déjà appliqué, ignoré : ${file}`);
        continue;
      }
      // dbDir est un chemin de fichiers système (fileURLToPath) : on joint
      // avec path.join, jamais avec new URL.
      const sql = await readFile(path.join(dbDir, file), 'utf8');

      const client = await pool.connect();
      try {
        await client.query('begin');
        await client.query(sql);
        await client.query('insert into schema_migrations (nom) values ($1)', [file]);
        await client.query('commit');
        console.info(`[${mode}] appliqué : ${file}`);
      } catch (error) {
        await client.query('rollback');
        console.error(`[${mode}] ÉCHEC sur ${file} (transaction annulée) :`, error);
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
  console.error(`[${mode}] Échec :`, error);
  process.exit(1);
});
