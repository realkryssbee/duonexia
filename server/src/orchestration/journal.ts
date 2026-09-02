// orchestration/journal.ts — journalisation de TOUT appel d'outil.
//
// Exigence de sécurité : chaque appel à un service externe est journalisé
// dans journal_outils, avec ses arguments, un résumé de son résultat, sa
// durée et son statut. C'est le recours unique en cas d'incident et une
// pièce de conformité (registre des traitements RGPD).
//
// Règle d'or : on ouvre la ligne en 'en_cours' AVANT l'appel, on la referme
// (ok/erreur) après. Si l'écriture du journal échoue, on ne fait PAS échouer
// l'appel outil : on trace sur la console — un outil de pilotage ne doit
// jamais tomber parce que son journal est indisponible.

import type pg from 'pg';

export interface JournalContext {
  outil: string;
  // Arguments compacts et SANS secret : jamais de jeton, jamais de corps de
  // fichier. Chaque module d'intégration construit ses arguments de ce type.
  arguments: Record<string, unknown>;
  utilisateur: string; // email de l'associé, ou 'system' pour les jobs
}

export interface ToolCallOutcome<T> {
  ok: boolean;
  statut: 'ok' | 'erreur';
  duree_ms: number;
  resultat: T | null;
  erreur?: string;
}

/**
 * Enveloppe l'exécution d'un outil : journalise, exécute, referme la ligne,
 * puis propage l'éventuelle erreur à l'appelant (le job décide de la suite).
 */
export async function logToolCall<T>(
  pool: pg.Pool,
  context: JournalContext,
  run: () => Promise<T>
): Promise<ToolCallOutcome<T>> {
  const startedAt = Date.now();
  let journalId: number | null = null;

  try {
    const inserted = await pool.query(
      `insert into journal_outils (outil, arguments, statut, utilisateur)
       values ($1, $2, 'en_cours', $3)
       returning id`,
      [context.outil, context.arguments, context.utilisateur]
    );
    journalId = inserted.rows[0]?.id ?? null;
  } catch (error) {
    // Le journal ne doit jamais faire tomber l'outil.
    console.error('[journal] impossible de créer la ligne de journal :', error);
  }

  const outcome: ToolCallOutcome<T> = {
    ok: false,
    statut: 'erreur',
    duree_ms: 0,
    resultat: null,
  };

  try {
    const result = await run();
    outcome.ok = true;
    outcome.statut = 'ok';
    outcome.resultat = result;
    return outcome;
  } catch (error) {
    outcome.erreur = error instanceof Error ? error.message : String(error);
    throw error;
  } finally {
    outcome.duree_ms = Date.now() - startedAt;
    if (journalId !== null) {
      try {
        await pool.query(
          `update journal_outils
           set resultat = $2, duree_ms = $3, statut = $4
           where id = $1`,
          [journalId, buildSummary(outcome), outcome.duree_ms, outcome.statut]
        );
      } catch (error) {
        console.error('[journal] impossible de refermer la ligne de journal :', error);
      }
    }
  }
}

// Résumé structuré stocké dans resultat — jamais le corps brut volumineux.
// Les modules d'intégration passent déjà des résultats compacts ; on borne
// ici par sécurité (taille maximale d'un champ jsonb raisonnable).
function buildSummary<T>(outcome: ToolCallOutcome<T>): Record<string, unknown> {
  if (outcome.statut === 'erreur') {
    return { erreur: outcome.erreur ?? 'erreur inconnue' };
  }
  const value = outcome.resultat;
  if (value === null || value === undefined) return { ok: true };
  try {
    const serialized = JSON.stringify(value);
    if (serialized.length <= 8000) return { ok: true, detail: value };
    // Trop volumineux pour le journal : on stocke un compte rendu minimal.
    if (Array.isArray(value)) {
      return { ok: true, detail: { type: 'tableau', elements: value.length } };
    }
    if (typeof value === 'object') {
      return { ok: true, detail: { type: 'objet', clefs: Object.keys(value as object).length } };
    }
    return { ok: true, detail: String(value).slice(0, 500) };
  } catch {
    return { ok: true };
  }
}
