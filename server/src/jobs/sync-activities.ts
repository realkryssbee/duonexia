// jobs/sync-activities.ts — le job qui alimente activites depuis les
// systèmes externes (V1 : GitHub et Vercel).
//
// Déroulé par branchement (integrations.actif = true) :
//   1. résolution du module d'intégration (usine) avec un transport HTTP
//      journalisé — chaque appel externe est tracé dans journal_outils ;
//   2. remontée des événements depuis `since` (fenêtre configurée) ;
//   3. insertion DÉDUPLIQUÉE : fingerprint = hash(source, projet, type, id
//      externe) ; l'index unique partiel absorbe les re-exécutions ;
//   4. mise à jour de projets.date_derniere_activite (dernier événement) ;
//   5. rafraîchissement optionnel de l'aperçu dans integrations.metadata
//      (PR ouvertes, branches actives, domaines).
//
// Un branchement en échec (jeton absent, service injoignable) ne fait pas
// échouer les autres : chaque branchement est isolé dans le rapport.

import crypto from 'node:crypto';
import type pg from 'pg';
import { env } from '../config/env.js';
import { ExternalServiceError } from '../integrations/integration.js';
import { createIntegrationService } from '../integrations/index.js';
import { createJournaledHttp } from '../orchestration/transports.js';

export interface SyncDetail {
  projetId: string;
  type: string;
  identifiantExterne: string;
  ok: boolean;
  evenementsRecus: number;
  evenementsInseres: number;
  apercuRafraichi: boolean;
  dureeMs: number;
  erreur: string | null;
}

export interface SyncSummary {
  debut: string;
  fin: string;
  dureeMs: number;
  branchements: number;
  reussites: number;
  echecs: number;
  evenementsInseres: number;
  details: SyncDetail[];
}

export async function syncAll(
  pool: pg.Pool,
  utilisateur: string = 'system'
): Promise<SyncSummary> {
  const debut = new Date();
  const summary: SyncSummary = {
    debut: debut.toISOString(),
    fin: '',
    dureeMs: 0,
    branchements: 0,
    reussites: 0,
    echecs: 0,
    evenementsInseres: 0,
    details: [],
  };

  // Un transport journalisé par type de service (jetons partagés).
  const transportsByType: Record<string, ReturnType<typeof createJournaledHttp>> = {};
  if (env.githubToken) {
    transportsByType.github = createJournaledHttp({
      baseUrl: env.githubApiUrl,
      token: env.githubToken,
      pool,
      utilisateur,
    });
  }
  if (env.vercelToken) {
    transportsByType.vercel = createJournaledHttp({
      baseUrl: env.vercelApiUrl,
      token: env.vercelToken,
      pool,
      utilisateur,
    });
  }

  const integrationsResult = await pool.query(
    `select i.id, i.projet_id, i.type, i.identifiant_externe, i.metadata
     from integrations i
     where i.actif = true
     order by i.type, i.identifiant_externe`
  );
  const integrations: Array<{
    id: string;
    projet_id: string;
    type: string;
    identifiant_externe: string;
    metadata: Record<string, unknown>;
  }> = integrationsResult.rows;

  const since = new Date(Date.now() - env.syncLookbackDays * 86_400_000);

  for (const integration of integrations) {
    const startedAt = Date.now();
    const detail: SyncDetail = {
      projetId: integration.projet_id,
      type: integration.type,
      identifiantExterne: integration.identifiant_externe,
      ok: false,
      evenementsRecus: 0,
      evenementsInseres: 0,
      apercuRafraichi: false,
      dureeMs: 0,
      erreur: null,
    };
    summary.branchements += 1;

    try {
      // Jeton manquant : on ignore proprement le branchement (et on le dit).
      const http = transportsByType[integration.type];
      if (!http && integration.type !== 'fake') {
        throw new ExternalServiceError(
          `Jeton absent pour l'intégration ${integration.type} (GITHUB_TOKEN / VERCEL_TOKEN) : branchement ignoré.`
        );
      }

      const service = createIntegrationService(integration.type, {
        http,
        teamId: env.vercelTeamId,
      });
      const target = {
        projetId: integration.projet_id,
        integrationId: integration.id,
        identifiantExterne: integration.identifiant_externe,
        metadata: integration.metadata ?? {},
      };

      // 1-2. Remontée des événements.
      const events = await service.fetchActivities(target, { since });
      detail.evenementsRecus = events.length;

      // 3-4. Insertion dédupliquée + mise à jour de la dernière activité.
      const client = await pool.connect();
      try {
        await client.query('begin');
        for (const event of events) {
          const fingerprint = crypto
            .createHash('sha256')
            .update(
              // La source est le type d'intégration : stable par branchement.
              `${integration.type}:${integration.projet_id}:${event.type}:${event.externalId}`
            )
            .digest('hex');

          const inserted = await client.query(
            `insert into activites (projet_id, source, type, payload, horodatage, fingerprint)
             values ($1, $2, $3, $4, $5, $6)
             on conflict (source, fingerprint) where fingerprint is not null
             do nothing`,
            [
              integration.projet_id,
              integration.type,
              event.type,
              JSON.stringify(event.payload),
              event.horodatage,
              fingerprint,
            ]
          );
          if ((inserted.rowCount ?? 0) > 0) {
            detail.evenementsInseres += 1;
          }

          // La "dernière activité" d'un projet = son événement le plus récent,
          // même si l'événement était déjà connu (re-sync).
          await client.query(
            `update projets
             set date_derniere_activite = greatest(
                   coalesce(date_derniere_activite, $2), $2)
             where id = $1`,
            [integration.projet_id, event.horodatage]
          );
        }
        await client.query('commit');
      } catch (error) {
        await client.query('rollback');
        throw error;
      } finally {
        client.release();
      }

      // 5. Rafraîchissement de l'aperçu (PR ouvertes, branches, domaines…).
      if (typeof service.fetchProjectMetadata === 'function') {
        const snapshot = await service.fetchProjectMetadata(target);
        await pool.query(
          `update integrations set metadata = $2 where id = $1`,
          [integration.id, JSON.stringify(snapshot)]
        );
        detail.apercuRafraichi = true;
      }

      detail.ok = true;
      summary.reussites += 1;
      summary.evenementsInseres += detail.evenementsInseres;
    } catch (error) {
      detail.ok = false;
      detail.erreur = error instanceof Error ? error.message : String(error);
      summary.echecs += 1;
      console.error(
        `[sync] échec sur ${integration.type} / ${integration.identifiant_externe} :`,
        detail.erreur
      );
    } finally {
      detail.dureeMs = Date.now() - startedAt;
      summary.details.push(detail);
    }
  }

  const fin = new Date();
  summary.fin = fin.toISOString();
  summary.dureeMs = fin.getTime() - debut.getTime();
  return summary;
}
