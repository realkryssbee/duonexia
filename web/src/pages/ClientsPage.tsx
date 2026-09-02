// pages/ClientsPage.tsx — le registre des clients, filtrable par vertical et
// statut. Chaque ligne mène à la vue client.
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api/client';
import { Card, Chargement, ErreurPanel, StatutClientBadge, Vide } from '../components/ui';
import { formatRelative } from '../lib/format';
import { statutClientLabel, VERTICAL_LABELS, verticalLabel } from '../lib/labels';
import type { Client } from '../types';

const STATUTS_CLIENT = ['prospect', 'actif', 'suspendu', 'ancien'];

export default function ClientsPage() {
  const [vertical, setVertical] = useState('');
  const [statut, setStatut] = useState('');
  const [clients, setClients] = useState<Client[] | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);

  useEffect(() => {
    let actif = true;
    setClients(null);
    api
      .clients({
        vertical: vertical || undefined,
        statut: statut || undefined,
      })
      .then((reponse) => {
        if (actif) setClients(reponse.clients);
      })
      .catch((error: unknown) => {
        if (actif) setErreur(error instanceof Error ? error.message : 'Chargement impossible.');
      });
    return () => {
      actif = false;
    };
  }, [vertical, statut]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-slate-900">Clients</h1>
          <p className="text-sm text-slate-500">Registre et accès aux vues clients</p>
        </div>
        <div className="flex gap-3">
          <select
            value={vertical}
            onChange={(event) => setVertical(event.target.value)}
            className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm"
          >
            <option value="">Tous les verticaux</option>
            {Object.keys(VERTICAL_LABELS).map((slug) => (
              <option key={slug} value={slug}>
                {VERTICAL_LABELS[slug]}
              </option>
            ))}
          </select>
          <select
            value={statut}
            onChange={(event) => setStatut(event.target.value)}
            className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm"
          >
            <option value="">Tous les statuts</option>
            {STATUTS_CLIENT.map((slug) => (
              <option key={slug} value={slug}>
                {statutClientLabel(slug)}
              </option>
            ))}
          </select>
        </div>
      </div>

      {erreur && <ErreurPanel message={erreur} />}
      {clients === null && !erreur ? (
        <Chargement />
      ) : (
        <Card>
          {clients && clients.length === 0 ? (
            <Vide>Aucun client pour ces filtres.</Vide>
          ) : (
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-slate-100 text-xs uppercase tracking-wide text-slate-400">
                  <th className="px-4 py-2 font-medium">Client</th>
                  <th className="px-4 py-2 font-medium">Vertical</th>
                  <th className="px-4 py-2 font-medium">Statut</th>
                  <th className="px-4 py-2 font-medium">Contact</th>
                  <th className="px-4 py-2 font-medium">Projets</th>
                  <th className="px-4 py-2 font-medium">Dernier contact</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {clients?.map((client) => (
                  <tr key={client.id} className="hover:bg-slate-50">
                    <td className="px-4 py-2.5">
                      <Link
                        to={`/clients/${client.id}`}
                        className="font-medium text-indigo-700 hover:underline"
                      >
                        {client.nom}
                      </Link>
                    </td>
                    <td className="px-4 py-2.5 text-slate-600">{verticalLabel(client.vertical)}</td>
                    <td className="px-4 py-2.5">
                      <StatutClientBadge statut={client.statut} />
                    </td>
                    <td className="px-4 py-2.5 text-slate-600">{client.contact_principal ?? '—'}</td>
                    <td className="px-4 py-2.5 text-slate-600">{client.nb_projets ?? 0}</td>
                    <td className="px-4 py-2.5 text-slate-600">
                      {formatRelative(client.date_dernier_contact)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Card>
      )}
    </div>
  );
}
