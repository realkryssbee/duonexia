// App.tsx — aiguillage racine selon l'état de session.
// Déconnecté : page de connexion. Connecté : le layout + les pages protégées.
import { Route, Routes } from 'react-router-dom';
import { useAuth } from './auth/AuthContext';
import Layout from './components/Layout';
import ClientPage from './pages/ClientPage';
import ClientsPage from './pages/ClientsPage';
import DashboardPage from './pages/DashboardPage';
import LoginPage from './pages/LoginPage';
import NotFoundPage from './pages/NotFoundPage';
import ProjetPage from './pages/ProjetPage';
import RecherchePage from './pages/RecherchePage';

export default function App() {
  const { email, checking } = useAuth();

  if (checking) {
    return (
      <div className="flex min-h-screen items-center justify-center text-sm text-slate-500">
        <span className="mr-2 inline-block h-5 w-5 animate-spin rounded-full border-2 border-slate-300 border-t-indigo-600 align-middle" />
        Vérification de la session…
      </div>
    );
  }

  if (!email) {
    return <LoginPage />;
  }

  return (
    <Routes>
      <Route element={<Layout />}>
        <Route path="/" element={<DashboardPage />} />
        <Route path="/clients" element={<ClientsPage />} />
        <Route path="/clients/:id" element={<ClientPage />} />
        <Route path="/projets/:id" element={<ProjetPage />} />
        <Route path="/recherche" element={<RecherchePage />} />
        <Route path="*" element={<NotFoundPage />} />
      </Route>
    </Routes>
  );
}
