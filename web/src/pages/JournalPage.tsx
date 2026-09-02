// pages/JournalPage.tsx — le journal d'audit : chaque appel d'outil externe,
// avec son statut et sa durée. C'est la preuve visible que la journalisation
// tourne, et le premier réflexe en cas d'incident ou de doute.
import { useEffect, useState, type FormEvent } from 'react';
import { api } from '../api/client';
import { Card, Chargement, ErreurPanel, Vide } from '../components/ui';
import { formatDateTime } from '../lib/format';
import type { JournalEntree } from '../types';

export default function JournalPage() {
  const [entrees, setEntrees] = useState<JournalEntree[] | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const [outil, setOutil] = useState('');

  const charger = () => {
    setErreur(null);
    api
      .journal(200)
      .then((reponse) => setEntrees(reponse.entrees))
      .catch((error: unknown) =>
        setErreur(error instanceof Error ? error.message : 'Chargement impossible.')
      );
  };

  useEffect(() => {
    let annule = false;
    api
      .journal(200)
      .then((reponse) => {
        if (!annule) setEntrees(reponse.entrees);
      })
      .catch((error: unknown) => {
        if (!annule) setErreur(error instanceof Error ? error.message : 'Chargement impossible.');
      });
    return () => {
      annule = true;
    };
  }, []);

  const filtrer = (event: FormEvent) => {
    event.preventDefault();
    charger();
  };

  const visibles = entrees?.filter((entree) =>
    outil.trim() === '' ? true : entree.outil.includes(outil.trim())
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-slate-900">Journal d'audit</h1>
          <p className="text-sm text-slate-500">
            Derniers appels d'outils (synchronisation et systèmes externes)
          </p>
        </div>
        <form onSubmit={filtrer} className="flex gap-2">
          <input
            type="text"
            value={outil}
            onChange={(event) => setOutil(event.target.value)}
            placeholder="Filtrer par outil (ex. github.commits)"
            className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm outline-none focus:border-indigo-500"
          />
          <button
            type="submit"
            className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-50"
          >
            Filtrer
          </button>
          <button
            type="button"
            onClick={charger}
            className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-50"
          >
            Actualiser
          </button>
        </form>
      </div>

      {erreur && <ErreurPanel message={erreur} />}
      {entrees === null && !erreur ? (
        <Chargement />
      ) : (
        <Card>
          {visibles && visibles.length === 0 ? (
            <Vide>Aucune entrée pour ce filtre.</Vide>
          ) : (
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-slate-100 text-xs uppercase tracking-wide text-slate-400">
                  <th className="px-4 py-2 font-medium">Horodatage</th>
                  <th className="px-4 py-2 font-medium">Outil</th>
                  <th className="px-4 py-2 font-medium">Statut</th>
                  <th className="px-4 py-2 font-medium">Durée</th>
                  <th className="px-4 py-2 font-medium">Utilisateur</th>
                  <th className="px-4 py-2 font-medium">Détail</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {visibles?.map((entree) => (
                  <tr key={entree.id} className="align-top hover:bg-slate-50">
                    <td className="px-4 py-2 whitespace-nowrap text-slate-500">
                      {formatDateTime(entree.horodatage)}
                    </td>
                    <td className="px-4 py-2">
                      <code className="rounded bg-slate-100 px-1.5 py-0.5 text-xs text-slate-700">
                        {entree.outil}
                      </code>
                    </td>
                    <td className="px-4 py-2">
                      <StatutJournal statut={entree.statut} />
                    </td>
                    <td className="px-4 py-2 text-slate-500">
                      {entree.duree_ms !== null ? `${entree.duree_ms} ms` : '—'}
                    </td>
                    <td className="px-4 py-2 text-slate-500">{entree.utilisateur}</td>
                    <td className="max-w-md px-4 py-2">
                      <p className="text-xs break-words text-slate-500">
                        {compact(entree.resultat ?? entree.arguments)}
                      </p>
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

function StatutJournal({ statut }: { statut: string }) {
  const classes =
    statut === 'ok'
      ? 'bg-emerald-100 text-emerald-800'
      : statut === 'erreur'
        ? 'bg-rose-100 text-rose-700'
        : 'bg-amber-100 text-amber-800';
  const libelle = statut === 'ok' ? 'OK' : statut === 'erreur' ? 'Erreur' : 'En cours';
  return (
    <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${classes}`}>
      {libelle}
    </span>
  );
}

/** Affiche compact le détail journalisé (arguments/résultat). */
function compact(valeur: Record<string, unknown> | null): string {
  if (!valeur) return '—';
  // Les arguments sont souvent parlants (ex. {"repo": "owner/repo"}).
  const texte = JSON.stringify(valeur);
  return texte.length > 160 ? `${texte.slice(0, 157)}…` : texte;
}
