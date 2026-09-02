// components/ActiviteItem.tsx — une ligne du flux d'activité, avec pastille
// de type, message, source et horodatage relatif. Optionnellement, le projet
// d'origine est un lien (flux global du tableau de bord).
import { Link } from 'react-router-dom';
import { messageActivite, urlActivite } from '../lib/activite';
import { formatRelative } from '../lib/format';
import { sourceLabel, typeActiviteLabel, typeActivitePoint } from '../lib/labels';
import type { Activite } from '../types';

interface Props {
  activite: Activite;
  /** Affiche le projet d'origine comme lien (flux global). */
  avecProjet?: boolean;
}

export default function ActiviteItem({ activite, avecProjet = false }: Props) {
  const url = urlActivite(activite);
  const contenu = url ? (
    <a
      href={url}
      target="_blank"
      rel="noreferrer"
      className="font-medium text-indigo-700 hover:underline"
    >
      {messageActivite(activite)}
    </a>
  ) : (
    <span className="font-medium text-slate-800">{messageActivite(activite)}</span>
  );

  return (
    <li className="flex gap-3 px-4 py-2.5">
      <span
        className={`mt-1.5 inline-block h-2.5 w-2.5 shrink-0 rounded-full ${typeActivitePoint(activite.type)}`}
        title={typeActiviteLabel(activite.type)}
      />
      <div className="min-w-0 flex-1">
        <p className="text-sm leading-snug">{contenu}</p>
        <p className="mt-0.5 text-xs text-slate-500">
          {sourceLabel(activite.source)} · {typeActiviteLabel(activite.type)} ·{' '}
          <time dateTime={activite.horodatage}>{formatRelative(activite.horodatage)}</time>
          {avecProjet && activite.projet_nom && activite.projet_id && (
            <>
              {' · '}
              <Link
                to={`/projets/${activite.projet_id}`}
                className="text-indigo-600 hover:underline"
              >
                {activite.projet_nom}
              </Link>
            </>
          )}
        </p>
      </div>
    </li>
  );
}
