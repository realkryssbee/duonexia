// scripts/test-journal.ts — vérifie le MÉCANISME de journalisation des appels
// externes, sans réseau réel : le transport journalisé est exécuté contre un
// serveur HTTP factice local, et on contrôle les lignes écrites dans
// journal_outils (statut 'ok' puis 'erreur', arguments compacts).
//
// Prérequis : DATABASE_URL pointant vers une base migrée (0001).
// Usage : $env:DATABASE_URL='…' ; npx tsx scripts/test-journal.ts

import 'dotenv/config';
import http from 'node:http';
import pg from 'pg';
import { createJournaledHttp } from '../src/orchestration/transports.js';

let echecs = 0;
function verifier(nom: string, condition: boolean, detail = ''): void {
  if (condition) {
    console.log(`  ✓ ${nom}`);
  } else {
    echecs += 1;
    console.error(`  ✗ ${nom}${detail ? ` — ${detail}` : ''}`);
  }
}

async function main(): Promise<void> {
  const databaseUrl = process.env.DATABASE_URL ?? '';
  if (!databaseUrl) {
    console.error('[test-journal] DATABASE_URL manquante.');
    process.exit(1);
  }
  const sslMode = process.env.PGSSLMODE ?? 'require';
  const pool = new pg.Pool({
    connectionString: databaseUrl,
    ssl: sslMode === 'disable' ? false : { rejectUnauthorized: sslMode === 'verify-full' },
  });

  // Serveur HTTP factice : simule un système externe.
  const serveur = http.createServer((requete, reponse) => {
    if (requete.url === '/ok') {
      reponse.writeHead(200, { 'content-type': 'application/json' });
      reponse.end(JSON.stringify({ echo: 'valeur' }));
    } else {
      reponse.writeHead(500);
      reponse.end('panne simulée');
    }
  });
  await new Promise<void>((resoudre) => serveur.listen(0, '127.0.0.1', resoudre));
  const port = (serveur.address() as { port: number }).port;

  try {
    await pool.query(`delete from journal_outils where utilisateur = 'test-journal'`);

    const transport = createJournaledHttp({
      baseUrl: `http://127.0.0.1:${port}`,
      token: 'jeton-factice',
      pool,
      utilisateur: 'test-journal',
    });

    // 1. Appel réussi → ligne 'ok'.
    const resultat = (await transport.getJson('/ok', {
      tool: 'test.echo',
      toolArgs: { exemple: 1 },
    })) as { echo?: string };
    verifier('appel réussi renvoie la donnée', resultat.echo === 'valeur');

    const ligneOk = (
      await pool.query(
        `select outil, arguments, statut from journal_outils
         where utilisateur = 'test-journal' order by id desc limit 1`
      )
    ).rows[0];
    verifier('ligne de journal écrite (outil test.echo)', ligneOk?.outil === 'test.echo');
    verifier('statut "ok" pour l’appel réussi', ligneOk?.statut === 'ok');
    const argumentsOk = ligneOk?.arguments as { exemple?: number } | undefined;
    verifier('arguments compacts journalisés sans secret',
      argumentsOk?.exemple === 1 && !JSON.stringify(argumentsOk).includes('jeton'));

    // 2. Appel en échec → ligne 'erreur' et l'erreur est propagée.
    let erreurCapturee = false;
    try {
      await transport.getJson('/ko', { tool: 'test.ko', toolArgs: {} });
    } catch {
      erreurCapturee = true;
    }
    verifier('l’erreur du système externe est propagée', erreurCapturee);

    const ligneKo = (
      await pool.query(
        `select statut, resultat from journal_outils
         where utilisateur = 'test-journal' and outil = 'test.ko' order by id desc limit 1`
      )
    ).rows[0];
    verifier('statut "erreur" pour l’appel en échec', ligneKo?.statut === 'erreur');
    const resultatKo = ligneKo?.resultat as { erreur?: string } | undefined;
    verifier('résultat d’erreur non vide', typeof resultatKo?.erreur === 'string' && resultatKo.erreur.length > 0);
  } finally {
    await pool.query(`delete from journal_outils where utilisateur = 'test-journal'`);
    serveur.close();
    await pool.end();
  }

  console.log(`\nRésultat : ${echecs === 0 ? 'journalisation conforme' : `${echecs} échec(s)`}`);
  process.exit(echecs === 0 ? 0 : 1);
}

main().catch((error) => {
  console.error('[test-journal] échec technique :', error);
  process.exit(1);
});
