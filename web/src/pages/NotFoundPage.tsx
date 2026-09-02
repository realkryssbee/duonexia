// pages/NotFoundPage.tsx — route inconnue.
import { Link } from 'react-router-dom';

export default function NotFoundPage() {
  return (
    <div className="py-20 text-center">
      <p className="text-lg font-semibold text-slate-700">Page introuvable</p>
      <Link to="/" className="mt-2 inline-block text-sm text-indigo-600 hover:underline">
        Retour au tableau de bord
      </Link>
    </div>
  );
}
