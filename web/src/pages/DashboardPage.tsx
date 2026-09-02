// pages/DashboardPage.tsx — le tableau de bord d'accueil (V1) :
//   * alertes : projets inactifs > 14 jours, échéances ≤ 7 jours (y compris
//     dépassées), factures en attente ;
//   * projets actifs avec statut et dernière activité ;
//   * flux consolidé des 48 dernières heures.
import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api/client';
import ActiviteItem from '../components/ActiviteItem';
import { Card, CardHeader, Chargement, ErreurPanel, StatutProjetBadge, Vide } from '../components/ui';
import { formatMontant, formatRelative, joursAvantEcheance } from '../lib/format';
import { verticalLabel } from '../lib/labels';
import type { AlerteProjet, DashboardResponse, Projet } from '../types';

export default function DashboardPage() {
  const [donnees, setDonnees] = useState<DashboardResponse | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);

  const charger = useCallback(() => {
    setErreur(null);
    api
      .dashboard()
      .then(setDonnees)
      .catch((error: unknown) =>
        setErreur(error instanceof Error ? error.message : 'Chargement impossible.')
      );
  }, []);

  useEffect(() => {
    charger();
  }, [charger]);

  if (erreur) {
    return (
      <div className="space-y-4">
        <ErreurPanel message={erreur} />
        <button
          type="button"
          onClick={charger}
          className="rounded-lg bg-indigo-600 px-3 py-1.5 text-sm text-white hover:bg-indigo-700"
        >
          Réessayer
        </button>
      </div>
    );
  }
  if (!donnees) return <Chargement />;

  const totalAlertes =
    donnees.alertes.projetsInactifs.length +
    donnees.alertes.echeancesProches.length +
    donnees.alertes.facturesEnAttente.length;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-slate-900">Tableau de bord</h1>
          <p className="text-sm text-slate-500">
            Produit le {new Date(donnees.produitLe).toLocaleString('fr-BE')}
          </p>
        </div>
        <button
          type="button"
          onClick={charger}
          className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-50"
        >
          Actualiser
        </button>
      </div>

      {/* Chiffres clés */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatChiffre
          titre="Projets vivants"
          valeur={donnees.projetsActifs.length}
          detail={`${donnees.projetsActifs.filter((p) => p.statut === 'en_cours').length} en cours · ${donnees.projetsActifs.filter((p) => p.statut === 'en_pause').length} en pause`}
        />
        <StatChiffre
          titre="Alertes"
          valeur={totalAlertes}
          detail={`${donnees.alertes.projetsInactifs.length} inactifs · ${donnees.alertes.echeancesProches.length} échéances · ${donnees.alertes.facturesEnAttente.length} factures`}
        />
        <StatChiffre
          titre="Activité (48 h)"
          valeur={donnees.flux48h.length}
          detail="commits, déploiements et notes"
        />
      </div>

      {/* Alertes */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <CardAlerte
          titre="Inactifs depuis > 14 jours"
          couleur="border-l-amber-500"
          vide="Aucun projet en sommeil."
        >
          {donnees.alertes.projetsInactifs.map((alerte) => (
            <LigneAlerte key={alerte.id} alerte={alerte} />
          ))}
        </CardAlerte>
        <CardAlerte
          titre="Échéances ≤ 7 jours"
          couleur="border-l-rose-500"
          vide="Aucune échéance imminente."
        >
          {donnees.alertes.echeancesProches.map((alerte) => (
            <LigneAlerte key={alerte.id} alerte={alerte} />
          ))}
        </CardAlerte>
        <CardAlerte
          titre="Factures en attente"
          couleur="border-l-sky-500"
          vide="Tout est facturé."
        >
          {donnees.alertes.facturesEnAttente.map((alerte) => (
            <LigneAlerte key={alerte.id} alerte={alerte} />
          ))}
        </CardAlerte>
      </div>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-5">
        {/* Projets actifs */}
        <Card className="xl:col-span-3">
          <CardHeader
            title="Projets actifs"
            subtitle="Statut et dernière activité"
          />
          <TableauProjets projets={donnees.projetsActifs} />
        </Card>

        {/* Flux 48 h */}
        <Card className="xl:col-span-2">
          <CardHeader title="Flux des dernières 48 heures" subtitle="Toutes sources" />
          {donnees.flux48h.length === 0 ? (
            <Vide>Aucune activité récente.</Vide>
          ) : (
            <ul className="max-h-[28rem] divide-y divide-slate-100 overflow-y-auto">
              {donnees.flux48h.map((activite) => (
                <ActiviteItem key={activite.id} activite={activite} avecProjet />
              ))}
            </ul>
          )}
        </Card>
      </div>
    </div>
  );
}

function StatChiffre({ titre, valeur, detail }: { titre: string; valeur: number; detail: string }) {
  return (
    <Card className="px-4 py-3">
      <p className="text-xs font-medium uppercase tracking-wide text-slate-500">{titre}</p>
      <p className="mt-1 text-2xl font-bold text-slate-900">{valeur}</p>
      <p className="mt-0.5 text-xs text-slate-500">{detail}</p>
    </Card>
  );
}

function CardAlerte({
  titre,
  couleur,
  vide,
  children,
}: {
  titre: string;
  couleur: string;
  vide: string;
  children: ReactNode;
}) {
  return (
    <Card className={`border-l-4 ${couleur}`}>
      <CardHeader title={titre} />
      <ul className="divide-y divide-slate-100">
        {Array.isArray(children) && children.length === 0 ? <Vide>{vide}</Vide> : children}
      </ul>
    </Card>
  );
}

function LigneAlerte({ alerte }: { alerte: AlerteProjet }) {
  const joursEcheance = joursAvantEcheance(alerte.date_echeance);
  return (
    <li className="px-4 py-2.5 text-sm">
      <Link to={`/projets/${alerte.id}`} className="font-medium text-slate-800 hover:text-indigo-700 hover:underline">
        {alerte.nom}
      </Link>
      <span className="ml-2 text-xs text-slate-500">{alerte.client_nom}</span>
      {alerte.jours > 0 && (
        <p className="mt-0.5 text-xs text-amber-700">Sans activité depuis {alerte.jours} jours.</p>
      )}
      {joursEcheance !== null && (
        <p className={`mt-0.5 text-xs ${joursEcheance <= 0 ? 'text-rose-700' : 'text-slate-500'}`}>
          {joursEcheance <= 0
            ? `Échéance dépassée depuis ${-joursEcheance} jour(s).`
            : `Échéance dans ${joursEcheance} jour(s).`}
        </p>
      )}
      {alerte.montant_en_attente > 0 && (
        <p className="mt-0.5 text-xs text-slate-600">
          Reste à facturer : {formatMontant(alerte.montant_en_attente)}
        </p>
      )}
    </li>
  );
}

function TableauProjets({ projets }: { projets: Projet[] }) {
  if (projets.length === 0) return <Vide>Aucun projet actif.</Vide>;
  return (
    <table className="w-full text-left text-sm">
      <thead>
        <tr className="border-b border-slate-100 text-xs uppercase tracking-wide text-slate-400">
          <th className="px-4 py-2 font-medium">Projet</th>
          <th className="px-4 py-2 font-medium">Client</th>
          <th className="px-4 py-2 font-medium">Statut</th>
          <th className="px-4 py-2 font-medium">Dernière activité</th>
          <th className="px-4 py-2 font-medium">Échéance</th>
          <th className="px-4 py-2 text-right font-medium">Reste à facturer</th>
        </tr>
      </thead>
      <tbody className="divide-y divide-slate-50">
        {projets.map((projet) => {
          const joursEcheance = joursAvantEcheance(projet.date_echeance);
          const reste = projet.montant_contractualise - projet.montant_facture;
          return (
            <tr key={projet.id} className="hover:bg-slate-50">
              <td className="px-4 py-2.5">
                <Link to={`/projets/${projet.id}`} className="font-medium text-indigo-700 hover:underline">
                  {projet.nom}
                </Link>
                <p className="text-xs text-slate-400">{verticalLabel(projet.vertical)}</p>
              </td>
              <td className="px-4 py-2.5 text-slate-600">{projet.client_nom ?? '—'}</td>
              <td className="px-4 py-2.5">
                <StatutProjetBadge statut={projet.statut} />
              </td>
              <td className="px-4 py-2.5 text-slate-600">
                {formatRelative(projet.date_derniere_activite)}
              </td>
              <td
                className={`px-4 py-2.5 ${joursEcheance !== null && joursEcheance <= 7 ? 'font-medium text-rose-700' : 'text-slate-600'}`}
              >
                {projet.date_echeance ?? '—'}
              </td>
              <td className={`px-4 py-2.5 text-right ${reste > 0 ? 'font-medium text-slate-800' : 'text-slate-400'}`}>
                {formatMontant(reste)}
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}
