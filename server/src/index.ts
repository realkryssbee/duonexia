// index.ts — point d'entrée du serveur Cockpit.
//
// Ordre de démarrage volontaire :
//   1. l'environnement est validé (config/env.ts) — un secret manquant
//      empêche le boot ;
//   2. le pool Postgres est créé et testé — base injoignable, pas de boot ;
//   3. le job planifié démarre (si RUN_JOBS=true) ;
//   4. l'API écoute.

import { env } from './config/env.js';
import { createPool } from './db/pool.js';
import { buildServer } from './http/server.js';
import { startScheduler, stopScheduler } from './jobs/scheduler.js';

async function main(): Promise<void> {
  const pool = createPool(env.databaseUrl, env.pgSslMode);

  // Test de connexion immédiat : on refuse de démarrer sur une base muette
  // (le message d'erreur brut de pg est peu parlant, on l'enrobe).
  try {
    await pool.query('select 1');
  } catch (error) {
    console.error('[boot] Base de données injoignable. Vérifiez DATABASE_URL et PGSSLMODE.');
    console.error(error);
    process.exit(1);
  }

  if (env.runJobs) {
    startScheduler(pool);
  }

  const app = await buildServer(pool);

  try {
    await app.listen({ port: env.port, host: env.host });
    console.info(`[boot] Cockpit API à l'écoute sur http://${env.host}:${env.port} (${env.nodeEnv})`);
  } catch (error) {
    app.log.error(error);
    process.exit(1);
  }

  // Arrêt propre : fermer le scheduler, l'API, puis le pool.
  let shuttingDown = false;
  const shutdown = async (signal: string): Promise<void> => {
    if (shuttingDown) return;
    shuttingDown = true;
    console.info(`[boot] ${signal} reçu, arrêt propre…`);
    stopScheduler();
    await app.close();
    await pool.end();
    process.exit(0);
  };
  process.on('SIGINT', () => void shutdown('SIGINT'));
  process.on('SIGTERM', () => void shutdown('SIGTERM'));
}

main().catch((error) => {
  console.error('[boot] Échec au démarrage :', error);
  process.exit(1);
});
