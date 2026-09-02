// pages/ClientPage.tsx — la vue client : fiche, engagement récurrent,
// projets associés, historique d'activité.
import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api } from '../api/client';
import ActiviteItem from '../components/ActiviteItem';
import {
  Card,
  CardHeader,
  Chargement,
  ErreurPanel,
  StatutClientBadge,
  StatutProjetBadge,
  Vide,
} from '../components/ui';
import { formatDate, formatMontant, formatRelative } from '../lib/format';
import { verticalLabel } from '../lib/labels';
import type { ClientDetailResponse } from '../types';

export default function ClientPage() {
  const { id } = useParams<{ id: string }>();
  const [donnees, setDonnees] = useState<ClientDetailResponse | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    let actif = true;
    setDonnees(null);
    api
      .client(id)
      .then((reponse) => {
        if (actif) setDonnees(reponse);
      })
      .catch((error: unknown) => {
        if (actif) setErreur(error instanceof Error ? error.message : 'Chargement impossible.');
      });
    return () => {
      actif = false;
    };
  }, [id]);

  if (erreur) return <ErreurPanel message={erreur} />;
  if (!donnees) return <Chargement />;

  const { client, projets, historique, engagement } = donnees;

  return (
    <div className="space-y-6">
      <div>
        <Link to="/clients" className="text-sm text-indigo-600 hover:underline">
          ← Registre des clients
        </Link>
        <div className="mt-2 flex flex-wrap items-center gap-3">
          <h1 className="text-xl font-semibold text-slate-900">{client.nom}</h1>
          <StatutClientBadge statut={client.statut} />
          <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-600">
            {verticalLabel(client.vertical)}
          </span>
        </div>
      </div>

      {/* Fiche / contact */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Card className="px-4 py-3 lg:col-span-2">
          <CardHeader title="Contact" />
          <dl className="grid grid-cols-1 gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
            <Info label="Contact principal" value={client.contact_principal} />
            <Info label="Dernier contact" value={formatRelative(client.date_dernier_contact)} />
            {client.email && (
              <a href={`mailto:${client.email}`} className="text-indigo-600 hover:underline">
                {client.email}
              </a>
            )}
            {client.telephone && <span>{client.telephone}</span>}
            <Info label="Client depuis" value={formatDate(client.created_at)} />
          </dl>
          {client.notes && (
            <p className="mt-3 rounded-lg bg-slate-50 px-3 py-2 text-sm whitespace-pre-line text-slate-600">
              {client.notes}
            </p>
          )}
        </Card>

        {/* Engagement récurrent */}
        <Card className="px-4 py-3">
          <CardHeader title="Engagement" subtitle="Projets vivants" />
          <div className="space-y-2 text-sm">
            <p className="flex justify-between">
              <span className="text-slate-500">Projets en cours</span>
              <span className="font-semibold">{engagement.projetsVivants}</span>
            </p>
            <p className="flex justify-between">
              <span className="text-slate-500">Contractualisé (vivant)</span>
              <span className="font-semibold">{formatMontant(engagement.contractualiseVivant)}</span>
            </p>
            <p className="flex justify-between">
              <span className="text-slate-500">Facturé (vivant)</span>
              <span className="font-semibold">{formatMontant(engagement.factureVivant)}</span>
            </p>
          </div>
        </Card>
      </div>

      {/* Projets associés */}
      <Card>
        <CardHeader title="Projets associés" subtitle={`${projets.length} projet(s)`} />
        {projets.length === 0 ? (
          <Vide>Aucun projet pour ce client.</Vide>
        ) : (
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-slate-100 text-xs uppercase tracking-wide text-slate-400">
                <th className="px-4 py-2 font-medium">Projet</th>
                <th className="px-4 py-2 font-medium">Statut</th>
                <th className="px-4 py-2 font-medium">Échéance</th>
                <th className="px-4 py-2 font-medium">Dernière activité</th>
                <th className="px-4 py-2 text-right font-medium">Reste à facturer</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {projets.map((projet) => (
                <tr key={projet.id} className="hover:bg-slate-50">
                  <td className="px-4 py-2.5">
                    <Link
                      to={`/projets/${projet.id}`}
                      className="font-medium text-indigo-700 hover:underline"
                    >
                      {projet.nom}
                    </Link>
                  </td>
                  <td className="px-4 py-2.5">
                    <StatutProjetBadge statut={projet.statut} />
                  </td>
                  <td className="px-4 py-2.5 text-slate-600">{projet.date_echeance ?? '—'}</td>
                  <td className="px-4 py-2.5 text-slate-600">
                    {formatRelative(projet.date_derniere_activite)}
                  </td>
                  <td className="px-4 py-2.5 text-right text-slate-600">
                    {formatMontant(projet.montant_contractualise - projet.montant_facture)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>

      {/* Historique */}
      <Card>
        <CardHeader title="Historique d'activité" subtitle="Tous les projets du client" />
        {historique.length === 0 ? (
          <Vide>Aucune activité enregistrée.</Vide>
        ) : (
          <ul className="divide-y divide-slate-100">
            {historique.map((activite) => (
              <ActiviteItem key={activite.id} activite={activite} avecProjet />
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}

function Info({ label, value }: { label: string; value: string | null }) {
  return (
    <div>
      <dt className="text-xs uppercase tracking-wide text-slate-400">{label}</dt>
      <dd className="text-slate-700">{value ?? '—'}</dd>
    </div>
  );
}
