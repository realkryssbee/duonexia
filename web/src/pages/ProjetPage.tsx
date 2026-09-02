// pages/ProjetPage.tsx — la vue projet : fiche complète, état financier,
// branchements externes (avec leur aperçu : PR ouvertes, branches actives,
// domaines), et activité chronologique.
import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api } from '../api/client';
import ActiviteItem from '../components/ActiviteItem';
import {
  Card,
  CardHeader,
  Chargement,
  ErreurPanel,
  StatutProjetBadge,
  Vide,
} from '../components/ui';
import { formatDateTime, formatMontant, formatRelative } from '../lib/format';
import {
  SOURCE_LABELS,
  statutClientLabel,
  verticalLabel,
} from '../lib/labels';
import type { Integration, ProjetDetailResponse } from '../types';

interface DonneesProjet {
  detail: ProjetDetailResponse;
  activites: import('../types').Activite[];
}

export default function ProjetPage() {
  const { id } = useParams<{ id: string }>();
  const [donnees, setDonnees] = useState<DonneesProjet | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    let actif = true;
    setDonnees(null);
    Promise.all([api.projet(id), api.projetActivites(id)])
      .then(([detail, activitesReponse]) => {
        if (actif) setDonnees({ detail, activites: activitesReponse.activites });
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

  const { projet, integrations, etatFinancier } = donnees.detail;
  const activitesChronologiques = [...donnees.activites].reverse();

  return (
    <div className="space-y-6">
      <div>
        {projet.client_id && (
          <Link to={`/clients/${projet.client_id}`} className="text-sm text-indigo-600 hover:underline">
            ← {projet.client_nom ?? 'Client'}
            {projet.client_statut ? ` (${statutClientLabel(projet.client_statut)})` : ''}
          </Link>
        )}
        <div className="mt-2 flex flex-wrap items-center gap-3">
          <h1 className="text-xl font-semibold text-slate-900">{projet.nom}</h1>
          <StatutProjetBadge statut={projet.statut} />
          <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-600">
            {verticalLabel(projet.vertical)}
          </span>
        </div>
        <p className="mt-1 text-sm text-slate-500">
          Dernière activité : {formatRelative(projet.date_derniere_activite)}
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        {/* Fiche */}
        <Card className="px-4 py-3 lg:col-span-2">
          <CardHeader title="Fiche projet" />
          <dl className="grid grid-cols-1 gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
            <Info label="Client" value={projet.client_nom} />
            <Info label="Début" value={projet.date_debut ?? '—'} />
            <Info label="Échéance" value={projet.date_echeance ?? '—'} />
            <Info label="Dernière activité" value={formatDateTime(projet.date_derniere_activite)} />
          </dl>
          {projet.depot_github && (
            <a
              href={`https://github.com/${projet.depot_github}`}
              target="_blank"
              rel="noreferrer"
              className="mt-2 inline-block text-sm text-indigo-600 hover:underline"
            >
              GitHub : {projet.depot_github} ↗
            </a>
          )}
          {projet.url_production && (
            <a
              href={projet.url_production}
              target="_blank"
              rel="noreferrer"
              className="mt-1 block text-sm text-indigo-600 hover:underline"
            >
              Production : {projet.url_production} ↗
            </a>
          )}
          {projet.notes && (
            <p className="mt-3 rounded-lg bg-slate-50 px-3 py-2 text-sm whitespace-pre-line text-slate-600">
              {projet.notes}
            </p>
          )}
          {afficherEnvironnements(projet.environnements)}
        </Card>

        {/* État financier */}
        <Card className="px-4 py-3">
          <CardHeader title="État financier" />
          <div className="space-y-2 text-sm">
            <LigneMontant label="Contractualisé" montant={etatFinancier.contractualise} />
            <LigneMontant label="Facturé" montant={etatFinancier.facture} />
            <div className="mt-3 h-2 overflow-hidden rounded-full bg-slate-100">
              <div
                className={`h-full rounded-full ${
                  etatFinancier.factureComplete ? 'bg-emerald-500' : 'bg-indigo-500'
                }`}
                style={{
                  width: `${Math.min(
                    100,
                    (etatFinancier.facture / Math.max(etatFinancier.contractualise, 1)) * 100
                  )}%`,
                }}
              />
            </div>
            <p className="text-xs text-slate-500">
              {etatFinancier.factureComplete
                ? 'Projet facturé en intégralité.'
                : `Reste à facturer : ${formatMontant(etatFinancier.resteAFacturer)}`}
            </p>
          </div>
        </Card>
      </div>

      {/* Systèmes externes */}
      <Card>
        <CardHeader
          title="Systèmes externes"
          subtitle="Branchements et dernier aperçu remonté par la synchronisation"
        />
        {integrations.length === 0 ? (
          <Vide>Aucun branchement enregistré pour ce projet.</Vide>
        ) : (
          <ul className="divide-y divide-slate-100">
            {integrations.map((integration) => (
              <IntegrationLigne key={integration.id} integration={integration} />
            ))}
          </ul>
        )}
      </Card>

      {/* Activité */}
      <Card>
        <CardHeader
          title="Activité"
          subtitle="Chronologique — du plus ancien au plus récent"
        />
        {activitesChronologiques.length === 0 ? (
          <Vide>Aucune activité enregistrée (la synchronisation tourne toutes les 15 minutes).</Vide>
        ) : (
          <ul className="max-h-[36rem] divide-y divide-slate-100 overflow-y-auto">
            {activitesChronologiques.map((activite) => (
              <ActiviteItem key={activite.id} activite={activite} />
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}

function Info({ label, value }: { label: string; value: string | null | undefined }) {
  return (
    <div>
      <dt className="text-xs uppercase tracking-wide text-slate-400">{label}</dt>
      <dd className="text-slate-700">{value ?? '—'}</dd>
    </div>
  );
}

function LigneMontant({ label, montant }: { label: string; montant: number }) {
  return (
    <p className="flex justify-between">
      <span className="text-slate-500">{label}</span>
      <span className="font-semibold">{formatMontant(montant)}</span>
    </p>
  );
}

/** Les environnements jsonb, ex. {"production": {"url": "…"}, "preview": …}. */
function afficherEnvironnements(environnements: Record<string, unknown> | undefined) {
  if (!environnements || Object.keys(environnements).length === 0) return null;
  const entrees = Object.entries(environnements);
  return (
    <div className="mt-4">
      <p className="text-xs uppercase tracking-wide text-slate-400">Environnements</p>
      <div className="mt-1.5 flex flex-wrap gap-2">
        {entrees.map(([nom, valeur]) => {
          const url =
            typeof valeur === 'object' && valeur !== null && 'url' in valeur
              ? String((valeur as { url?: unknown }).url ?? '')
              : '';
          return (
            <span
              key={nom}
              className="inline-flex items-center rounded-lg border border-slate-200 bg-slate-50 px-2 py-1 text-xs text-slate-600"
            >
              {nom}
              {url && (
                <a
                  href={url}
                  target="_blank"
                  rel="noreferrer"
                  className="ml-1.5 text-indigo-600 hover:underline"
                >
                  ↗
                </a>
              )}
            </span>
          );
        })}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Branchement externe + aperçu metadata (PR ouvertes, branches, domaines…)
// ---------------------------------------------------------------------------

function IntegrationLigne({ integration }: { integration: Integration }) {
  const lien =
    integration.type === 'github'
      ? `https://github.com/${integration.identifiant_externe}`
      : integration.type === 'vercel'
        ? 'https://vercel.com/dashboard'
        : null;

  return (
    <li className="px-4 py-3">
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <span className="font-semibold text-slate-800">
          {SOURCE_LABELS[integration.type] ?? integration.type}
        </span>
        <code className="rounded bg-slate-100 px-1.5 py-0.5 text-xs text-slate-600">
          {integration.identifiant_externe}
        </code>
        {!integration.actif && (
          <span className="rounded-full bg-slate-200 px-2 py-0.5 text-xs text-slate-600">inactif</span>
        )}
        {lien && (
          <a
            href={lien}
            target="_blank"
            rel="noreferrer"
            className="text-indigo-600 hover:underline"
          >
            Ouvrir ↗
          </a>
        )}
      </div>
      <ApercuIntegration integration={integration} />
    </li>
  );
}

function ApercuIntegration({ integration }: { integration: Integration }) {
  const metadata = integration.metadata ?? {};
  const pulledAt =
    typeof metadata.pulledAt === 'string' ? formatRelative(metadata.pulledAt) : null;

  if (integration.type === 'github') {
    const repo = metadata.repo as { description?: unknown; archived?: unknown } | undefined;
    const prs = Array.isArray(metadata.openPullRequests)
      ? (metadata.openPullRequests as Array<Record<string, unknown>>)
      : [];
    const branches = Array.isArray(metadata.activeBranches)
      ? (metadata.activeBranches as Array<Record<string, unknown>>)
      : [];
    return (
      <div className="mt-2 space-y-2 text-xs text-slate-500">
        {pulledAt && <p>Aperçu actualisé {pulledAt}.</p>}
        {typeof repo?.description === 'string' && <p>{repo.description}</p>}
        {prs.length > 0 && (
          <div>
            <p className="font-medium text-slate-600">Pull requests ouvertes ({prs.length})</p>
            <ul className="mt-1 space-y-1">
              {prs.slice(0, 6).map((pr) => (
                <li key={String(pr.number ?? '')}>
                  #{String(pr.number ?? '')} {String(pr.title ?? '')}{' '}
                  <span className="text-slate-400">
                    (branche {String(pr.branche ?? '—')}, par {String(pr.auteur ?? '—')})
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}
        {branches.length > 0 && (
          <div>
            <p className="font-medium text-slate-600">Branches les plus actives</p>
            <ul className="mt-1 space-y-0.5">
              {branches.slice(0, 5).map((branche) => (
                <li key={String(branche.name ?? '')}>
                  {String(branche.name ?? '—')} — dernier commit{' '}
                  {formatRelative(String(branche.dernierCommitDate ?? ''))}
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    );
  }

  if (integration.type === 'vercel') {
    const domains = Array.isArray(metadata.domains) ? (metadata.domains as string[]) : [];
    const project = metadata.project as { name?: unknown } | undefined;
    return (
      <div className="mt-2 space-y-1 text-xs text-slate-500">
        {pulledAt && <p>Aperçu actualisé {pulledAt}.</p>}
        <p>
          Projet Vercel : <span className="text-slate-700">{String(project?.name ?? '—')}</span>
        </p>
        {domains.length > 0 ? (
          <p>
            Domaines :{' '}
            {domains.map((domaine) => (
              <code key={domaine} className="mr-1 rounded bg-slate-100 px-1 py-0.5 text-slate-600">
                {domaine}
              </code>
            ))}
          </p>
        ) : (
          <p>Aucun domaine rattaché.</p>
        )}
      </div>
    );
  }

  // Module factice : la note prouve que l'aperçu circule jusqu'à l'interface.
  if (integration.type === 'fake' && typeof metadata.note === 'string') {
    return <p className="mt-2 text-xs text-slate-500">{metadata.note}</p>;
  }
  return null;
}
