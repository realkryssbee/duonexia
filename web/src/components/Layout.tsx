// components/Layout.tsx — cadre général : navigation latérale, recherche
// rapide en haut, déconnexion. Les pages sont rendues via <Outlet />.
import { useState, type FormEvent } from 'react';
import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';

const NAVIGATION = [
  { to: '/', label: 'Tableau de bord', fin: true },
  { to: '/clients', label: 'Clients', fin: false },
  { to: '/recherche', label: 'Recherche', fin: false },
];

export default function Layout() {
  const { email, logout } = useAuth();
  const navigate = useNavigate();
  const [recherche, setRecherche] = useState('');

  const soumettreRecherche = (event: FormEvent) => {
    event.preventDefault();
    const terme = recherche.trim();
    if (terme.length >= 2) {
      navigate(`/recherche?q=${encodeURIComponent(terme)}`);
    }
  };

  return (
    <div className="flex min-h-screen">
      {/* Barre latérale */}
      <aside className="fixed inset-y-0 left-0 flex w-56 flex-col bg-slate-900 text-slate-300">
        <div className="px-5 py-5">
          <p className="text-lg font-bold tracking-tight text-white">Cockpit</p>
          <p className="text-xs text-slate-500">Duonexia · pilotage</p>
        </div>
        <nav className="flex-1 space-y-1 px-3">
          {NAVIGATION.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.fin}
              className={({ isActive }) =>
                `block rounded-lg px-3 py-2 text-sm font-medium transition ${
                  isActive
                    ? 'bg-indigo-600 text-white'
                    : 'text-slate-300 hover:bg-slate-800 hover:text-white'
                }`
              }
            >
              {item.label}
            </NavLink>
          ))}
        </nav>
        <div className="border-t border-slate-800 px-5 py-4 text-xs text-slate-500">
          <p className="truncate text-slate-400">{email}</p>
          <button
            type="button"
            onClick={() => void logout()}
            className="mt-2 text-slate-400 underline-offset-2 hover:text-white hover:underline"
          >
            Se déconnecter
          </button>
        </div>
      </aside>

      {/* Contenu */}
      <div className="ml-56 flex min-h-screen flex-1 flex-col">
        <header className="sticky top-0 z-10 border-b border-slate-200 bg-white/90 px-8 py-3 backdrop-blur">
          <form onSubmit={soumettreRecherche} className="mx-auto max-w-xl">
            <input
              type="search"
              value={recherche}
              onChange={(event) => setRecherche(event.target.value)}
              placeholder="Rechercher un client, un projet, une activité…"
              className="w-full rounded-lg border border-slate-300 bg-slate-50 px-3 py-1.5 text-sm outline-none focus:border-indigo-500 focus:bg-white"
            />
          </form>
        </header>
        <main className="flex-1 px-8 py-6">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
