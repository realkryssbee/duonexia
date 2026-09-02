// pages/RecherchePage.tsx — la recherche transverse : une barre unique qui
// traverse clients, projets et activités (debounce 300 ms).
import { useEffect, useState, type FormEvent } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { api } from '../api/client';
import ActiviteItem from '../components/ActiviteItem';
import { Card, CardHeader, StatutProjetBadge, Vide } from '../components/ui';
import { formatDate } from '../lib/format';
import { verticalLabel } from '../lib/labels';
import type { Client, Projet, RechercheResponse } from '../types';

export default function RecherchePage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [saisie, setSaisie] = useState(searchParams.get('q') ?? '');
  const [resultats, setResultats] = useState<RechercheResponse | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const [enCours, setEnCours] = useState(false);

  // Garde la barre synchronisée quand on arrive avec ?q= (recherche rapide
  // du layout) ou qu'on revient en arrière.
  useEffect(() => {
    setSaisie(searchParams.get('q') ?? '');
  }, [searchParams]);

  useEffect(() => {
    const terme = saisie.trim();
    if (terme.length < 2) {
      setResultats(null);
      setErreur(null);
      setEnCours(false);
      return;
    }

    let annule = false;
    setEnCours(true);
    const minuterie = window.setTimeout(() => {
      api
        .recherche(terme)
        .then((reponse) => {
          if (!annule) {
            setResultats(reponse);
            setErreur(null);
          }
        })
        .catch((error: unknown) => {
          if (!annule) setErreur(error instanceof Error ? error.message : 'Recherche impossible.');
        })
        .finally(() => {
          if (!annule) setEnCours(false);
        });
    }, 300);

    return () => {
      annule = true;
      window.clearTimeout(minuterie);
    };
  }, [saisie]);

  const soumettre = (event: FormEvent) => {
    event.preventDefault();
    const terme = saisie.trim();
    if (terme.length >= 2) setSearchParams({ q: terme });
  };

  const vide =
    saisie.trim().length >= 2 &&
    !enCours &&
    resultats !== null &&
    resultats.clients.length === 0 &&
    resultats.projets.length === 0 &&
    resultats.activites.length === 0;

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-semibold text-slate-900">Recherche</h1>
        <p className="text-sm text-slate-500">Clients, projets et activité consolidée</p>
      </div>

      <form onSubmit={soumettre} className="max-w-2xl">
        <input
          type="search"
          autoFocus
          value={saisie}
          onChange={(event) => setSaisie(event.target.value)}
          placeholder="Ex. : Terra Sense, huissiers, paie, Maillard…"
          className="w-full rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm shadow-sm outline-none focus:border-indigo-500"
        />
      </form>

      {erreur && <p className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">{erreur}</p>}

      {saisie.trim().length >= 2 && !enCours && resultats && (
        <p className="text-sm text-slate-500">
          {resultats.nombre.clients + resultats.nombre.projets + resultats.nombre.activites === 0
            ? 'Aucun résultat.'
            : `${resultats.nombre.clients + resultats.nombre.projets + resultats.nombre.activites} résultat(s) pour « ${resultats.requete} ».`}
        </p>
      )}

      {enCours && <p className="text-sm text-slate-400">Recherche…</p>}

      {vide && <Vide>Aucun résultat pour cette recherche.</Vide>}

      {resultats && resultats.clients.length > 0 && (
        <Card>
          <CardHeader title={`Clients (${resultats.clients.length})`} />
          <ul className="divide-y divide-slate-50">
            {resultats.clients.map((client) => (
              <ResultatClient key={client.id} client={client} />
            ))}
          </ul>
        </Card>
      )}

      {resultats && resultats.projets.length > 0 && (
        <Card>
          <CardHeader title={`Projets (${resultats.projets.length})`} />
          <ul className="divide-y divide-slate-50">
            {resultats.projets.map((projet) => (
              <ResultatProjet key={projet.id} projet={projet} />
            ))}
          </ul>
        </Card>
      )}

      {resultats && resultats.activites.length > 0 && (
        <Card>
          <CardHeader title={`Activités (${resultats.activites.length})`} />
          <ul className="divide-y divide-slate-100">
            {resultats.activites.map((activite) => (
              <ActiviteItem key={activite.id} activite={activite} avecProjet />
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}

function ResultatClient({ client }: { client: Client }) {
  return (
    <li className="px-4 py-2.5">
      <Link to={`/clients/${client.id}`} className="font-medium text-indigo-700 hover:underline">
        {client.nom}
      </Link>
      <p className="text-xs text-slate-500">
        {verticalLabel(client.vertical)} · {client.contact_principal ?? '—'}
      </p>
    </li>
  );
}

function ResultatProjet({ projet }: { projet: Projet }) {
  return (
    <li className="flex items-center gap-3 px-4 py-2.5">
      <div className="min-w-0 flex-1">
        <Link to={`/projets/${projet.id}`} className="font-medium text-indigo-700 hover:underline">
          {projet.nom}
        </Link>
        <p className="text-xs text-slate-500">
          {projet.client_nom ?? ''} · {verticalLabel(projet.vertical)}
        </p>
      </div>
      <StatutProjetBadge statut={projet.statut} />
      <span className="hidden text-xs text-slate-400 sm:block">
        {formatDate(projet.date_derniere_activite)}
      </span>
    </li>
  );
}
