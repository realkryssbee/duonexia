// pages/LoginPage.tsx — connexion des associés. Les identifiants partent en
// HTTPS vers /api/auth/login ; le serveur pose un cookie de session HttpOnly.
import { useState, type FormEvent } from 'react';
import { useAuth } from '../auth/AuthContext';

export default function LoginPage() {
  const { login } = useAuth();
  const [email, setEmail] = useState('');
  const [motDePasse, setMotDePasse] = useState('');
  const [erreur, setErreur] = useState<string | null>(null);
  const [envoi, setEnvoi] = useState(false);

  const soumettre = async (event: FormEvent) => {
    event.preventDefault();
    setErreur(null);
    setEnvoi(true);
    try {
      await login(email, motDePasse);
    } catch (error) {
      setErreur(error instanceof Error ? error.message : 'Connexion impossible.');
    } finally {
      setEnvoi(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-100 px-4">
      <div className="w-full max-w-sm">
        <div className="mb-6 text-center">
          <p className="text-2xl font-bold tracking-tight text-slate-900">Cockpit</p>
          <p className="text-sm text-slate-500">Poste de pilotage Duonexia</p>
        </div>

        <form
          onSubmit={soumettre}
          className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm"
        >
          <label className="block text-sm font-medium text-slate-700">
            Email
            <input
              type="email"
              required
              autoComplete="username"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-indigo-500"
            />
          </label>
          <label className="mt-4 block text-sm font-medium text-slate-700">
            Mot de passe
            <input
              type="password"
              required
              autoComplete="current-password"
              value={motDePasse}
              onChange={(event) => setMotDePasse(event.target.value)}
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-indigo-500"
            />
          </label>

          {erreur && (
            <p className="mt-3 rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">{erreur}</p>
          )}

          <button
            type="submit"
            disabled={envoi}
            className="mt-5 w-full rounded-lg bg-indigo-600 px-3 py-2 text-sm font-medium text-white transition hover:bg-indigo-700 disabled:opacity-60"
          >
            {envoi ? 'Connexion…' : 'Se connecter'}
          </button>
        </form>
      </div>
    </div>
  );
}
