// auth/AuthContext.tsx — état de session global de l'interface.
//
// Au montage, on interroge /api/me pour savoir si un cookie de session est
// valide. Pendant une page, si une requête reçoit 401 (session expirée),
// l'api/client émet l'événement 'cockpit:unauthorized' : on repasse en mode
// déconnecté et l'application affiche la page de connexion.

import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { api, ApiError } from '../api/client';

interface AuthState {
  email: string | null;
  /** true tant que la vérification initiale de session n'est pas terminée. */
  checking: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [email, setEmail] = useState<string | null>(null);
  const [checking, setChecking] = useState(true);

  // Vérification initiale de la session.
  useEffect(() => {
    let cancelled = false;
    api
      .me()
      .then((me) => {
        if (!cancelled) setEmail(me.email);
      })
      .catch((error: unknown) => {
        // 401 : pas de session — état déconnecté normal.
        if (!(error instanceof ApiError)) console.error('Vérification de session :', error);
        if (!cancelled) setEmail(null);
      })
      .finally(() => {
        if (!cancelled) setChecking(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // Session expirée en cours de navigation.
  useEffect(() => {
    const onUnauthorized = () => setEmail(null);
    window.addEventListener('cockpit:unauthorized', onUnauthorized);
    return () => window.removeEventListener('cockpit:unauthorized', onUnauthorized);
  }, []);

  const login = async (loginEmail: string, password: string) => {
    const result = await api.login(loginEmail, password);
    setEmail(result.email);
  };

  const logout = async () => {
    try {
      await api.logout();
    } catch (error) {
      console.error('Déconnexion :', error);
    }
    setEmail(null);
  };

  return (
    <AuthContext.Provider value={{ email, checking, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthState {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth doit être utilisé dans un AuthProvider.');
  return context;
}
