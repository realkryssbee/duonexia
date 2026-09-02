// orchestration/transports.ts — le transport HTTP JOURNALISÉ fourni aux
// modules d'intégration.
//
// C'est ici que se matérialise la règle "tout appel à un service externe est
// journalisé dans journal_outils" : les modules ne font jamais de fetch
// eux-mêmes, ils reçoivent cette HttpTransport dont chaque GET ouvre et
// referme une ligne de journal. Un module d'intégration ne peut donc pas
// contourner la journalisation.
//
// Les secrets (jetons) restent dans l'orchestrateur : ils ne sont passés ni
// aux modules (qui reçoivent un transport déjà authentifié) ni, a fortiori,
// à l'interface.

import type pg from 'pg';
import {
  ExternalServiceError,
  type HttpGetOptions,
  type HttpTransport,
} from '../integrations/integration.js';
import { logToolCall } from './journal.js';

export interface JournaledHttpOptions {
  baseUrl: string;
  token: string;
  pool: pg.Pool;
  /** Qui appelle : email de l'associé ou 'system' (jobs planifiés). */
  utilisateur: string;
}

export function createJournaledHttp(options: JournaledHttpOptions): HttpTransport {
  const baseUrl = options.baseUrl.replace(/\/+$/, '');

  return {
    async getJson(path: string, httpOptions: HttpGetOptions): Promise<unknown> {
      const url = new URL(path.startsWith('/') ? path : `/${path}`, baseUrl);
      for (const [key, value] of Object.entries(httpOptions.query ?? {})) {
        url.searchParams.set(key, value);
      }

      // logToolCall ouvre la ligne 'en_cours' avant l'appel, la referme après,
      // et propage l'erreur du réseau à l'appelant (le job de sync).
      const outcome = await logToolCall(
        options.pool,
        {
          outil: httpOptions.tool,
          arguments: httpOptions.toolArgs,
          utilisateur: options.utilisateur,
        },
        async () => {
          const response = await fetch(url, {
            method: 'GET',
            headers: {
              authorization: `Bearer ${options.token}`,
              accept: 'application/json',
              'user-agent': 'cockpit-duonexia/0.1',
              ...httpOptions.headers,
            },
            // Garde-fou réseau : un service externe muet ne doit pas bloquer
            // le job de synchronisation indéfiniment.
            signal: AbortSignal.timeout(20_000),
          });

          if (!response.ok) {
            const body = await response.text().catch(() => '');
            throw new ExternalServiceError(
              `Réponse ${response.status} de ${path} : ${body.slice(0, 300)}`
            );
          }
          // Certaines routes renvoient 204 ou un corps vide.
          if (response.status === 204) return null;
          return response.json().catch(() => null);
        }
      );

      return outcome.resultat;
    },
  };
}
