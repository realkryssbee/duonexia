// api/client.ts — le SEUL point de contact de l'interface avec le monde.
//
// Règles de la couche INTERFACE :
//   * aucun appel direct à un service tiers (GitHub, Vercel, modèles…) ;
//   * aucun secret : les identifiants ne sont saisis que sur la page de
//     connexion et partent en HTTPS vers l'API ; la session est un cookie
//     HttpOnly que le navigateur renvoie tout seul (credentials: 'include') ;
//   * une réponse 401 pendant une page signifie "session expirée" : on
//     notifie le AuthContext (événement) qui ramène à la connexion.

import type {
  Client,
  ClientDetailResponse,
  DashboardResponse,
  Integration,
  Projet,
  ProjetDetailResponse,
  RechercheResponse,
} from '../types';

const API_BASE = ((import.meta.env.VITE_API_URL as string | undefined) ?? '').replace(/\/+$/, '');

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

async function http<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers: Record<string, string> = { accept: 'application/json' };
  if (init.body) headers['content-type'] = 'application/json';
  const response = await fetch(`${API_BASE}${path}`, {
    credentials: 'include',
    headers,
    ...init,
  });

  if (!response.ok) {
    let code = 'erreur_interne';
    let message = `Erreur HTTP ${response.status}`;
    try {
      const body = (await response.json()) as { error?: { code?: string; message?: string } };
      code = body?.error?.code ?? code;
      message = body?.error?.message ?? message;
    } catch {
      // corps non JSON : on garde le message par défaut
    }
    // Session expirée en cours de navigation (hors page de connexion).
    if (response.status === 401 && !path.startsWith('/api/auth/login')) {
      window.dispatchEvent(new Event('cockpit:unauthorized'));
    }
    throw new ApiError(response.status, code, message);
  }
  return (await response.json()) as T;
}

export const api = {
  // --- Session -------------------------------------------------------------
  me: () => http<{ email: string }>('/api/me'),
  login: (email: string, password: string) =>
    http<{ email: string }>('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    }),
  logout: () => http<{ ok: boolean }>('/api/auth/logout', { method: 'POST' }),

  // --- Tableau de bord ------------------------------------------------------
  dashboard: () => http<DashboardResponse>('/api/dashboard'),

  // --- Clients ----------------------------------------------------------------
  clients: (filters: { vertical?: string; statut?: string } = {}) => {
    const params = new URLSearchParams();
    if (filters.vertical) params.set('vertical', filters.vertical);
    if (filters.statut) params.set('statut', filters.statut);
    const query = params.toString();
    return http<{ clients: Client[] }>(`/api/clients${query ? `?${query}` : ''}`);
  },
  client: (id: string) => http<ClientDetailResponse>(`/api/clients/${encodeURIComponent(id)}`),

  // --- Projets -----------------------------------------------------------------
  projets: (clientId: string) =>
    http<{ projets: Projet[] }>(
      `/api/projets?client_id=${encodeURIComponent(clientId)}`
    ),
  projet: (id: string) => http<ProjetDetailResponse>(`/api/projets/${encodeURIComponent(id)}`),
  projetActivites: (id: string, limit = 100) =>
    http<{ activites: import('../types').Activite[] }>(
      `/api/projets/${encodeURIComponent(id)}/activites?limit=${limit}`
    ),
  integrations: (projetId: string) =>
    http<{ integrations: Integration[] }>(
      `/api/projets/${encodeURIComponent(projetId)}/integrations`
    ),

  // --- Recherche transverse -----------------------------------------------------
  recherche: (q: string) =>
    http<RechercheResponse>(`/api/recherche?q=${encodeURIComponent(q)}`),
};
