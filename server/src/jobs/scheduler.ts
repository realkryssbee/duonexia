// jobs/scheduler.ts — le job planifié de synchronisation.
//
// Démarré uniquement si RUN_JOBS=true (le dev d'interface n'a pas besoin de
// battre GitHub toutes les 15 minutes). Premier passage peu après le boot,
// puis à la cadence SYNC_CRON. Un échec d'un passage ne tue pas le serveur :
// il est journalisé (console + journal_outils) et le passage suivant repart.

import cron from 'node-cron';
import type pg from 'pg';
import { env } from '../config/env.js';
import { syncAll } from './sync-activities.js';

let task: cron.ScheduledTask | null = null;

export function startScheduler(pool: pg.Pool): void {
  if (task) return;

  // La validation de l'expression cron échoue au démarrage si elle est
  // malformée : cohérent avec la philosophie "refuser de démarrer plutôt
  // que tourner cassé".
  try {
    task = cron.schedule(env.syncCron, () => {
      void runOnce(pool);
    });
  } catch (error) {
    throw new Error(
      `[scheduler] SYNC_CRON invalide ("${env.syncCron}") : ${error instanceof Error ? error.message : error}`
    );
  }

  // Premier passage peu après le boot : le tableau de bord est alimenté sans
  // attendre le premier tick du cron.
  const initialDelayMs = 5_000;
  const initialTimer = setTimeout(() => {
    void runOnce(pool);
  }, initialDelayMs);
  initialTimer.unref();

  console.info(
    `[scheduler] synchronisation planifiée : "${env.syncCron}" (passage initial dans ${initialDelayMs} ms)`
  );
}

async function runOnce(pool: pg.Pool): Promise<void> {
  try {
    const summary = await syncAll(pool, 'system');
    console.info(
      `[sync] terminé en ${summary.dureeMs} ms : ${summary.reussites}/${summary.branchements} branchements OK, ` +
        `${summary.evenementsInseres} événements insérés, ${summary.echecs} échec(s).`
    );
  } catch (error) {
    console.error('[sync] passage en échec global :', error);
  }
}

export function stopScheduler(): void {
  if (task) {
    task.stop();
    task = null;
  }
}
