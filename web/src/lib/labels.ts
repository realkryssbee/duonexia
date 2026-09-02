// lib/labels.ts — libellés français et couleurs des valeurs de référence.
// Le serveur stocke des slugs ASCII ; l'interface porte l'affichage.

export const VERTICAL_LABELS: Record<string, string> = {
  huissiers: 'Huissiers de justice',
  secretariats_sociaux: 'Secrétariats sociaux',
  achats_pharmaceutiques: 'Achats pharmaceutiques',
  coachs_sportifs: 'Coachs sportifs',
  bien_etre: 'Bien-être',
  astrologie: 'Astrologie',
};

export function verticalLabel(vertical: string | null | undefined): string {
  return (vertical && VERTICAL_LABELS[vertical]) || vertical || '—';
}

const STATUTS_PROJET: Record<string, { label: string; classes: string }> = {
  en_cours: { label: 'En cours', classes: 'bg-emerald-100 text-emerald-800' },
  en_pause: { label: 'En pause', classes: 'bg-amber-100 text-amber-800' },
  termine: { label: 'Terminé', classes: 'bg-sky-100 text-sky-800' },
  archive: { label: 'Archivé', classes: 'bg-slate-200 text-slate-600' },
};

const STATUTS_CLIENT: Record<string, { label: string; classes: string }> = {
  prospect: { label: 'Prospect', classes: 'bg-slate-200 text-slate-700' },
  actif: { label: 'Actif', classes: 'bg-emerald-100 text-emerald-800' },
  suspendu: { label: 'Suspendu', classes: 'bg-amber-100 text-amber-800' },
  ancien: { label: 'Ancien', classes: 'bg-slate-300 text-slate-600' },
};

export function statutProjetLabel(statut: string): string {
  return STATUTS_PROJET[statut]?.label ?? statut;
}

export function statutProjetClasses(statut: string): string {
  return STATUTS_PROJET[statut]?.classes ?? 'bg-slate-200 text-slate-700';
}

export function statutClientLabel(statut: string): string {
  return STATUTS_CLIENT[statut]?.label ?? statut;
}

export function statutClientClasses(statut: string): string {
  return STATUTS_CLIENT[statut]?.classes ?? 'bg-slate-200 text-slate-700';
}

export const SOURCE_LABELS: Record<string, string> = {
  github: 'GitHub',
  vercel: 'Vercel',
  jira: 'Jira',
  supabase: 'Supabase',
  nas: 'NAS',
  mail: 'Messagerie',
  manuel: 'Manuel',
  fake: 'Démo',
};

export function sourceLabel(source: string): string {
  return SOURCE_LABELS[source] ?? source;
}

const TYPES_ACTIVITE: Record<string, { label: string; point: string }> = {
  commit: { label: 'Commit', point: 'bg-slate-500' },
  pull_request: { label: 'Pull request', point: 'bg-violet-500' },
  deployment: { label: 'Déploiement', point: 'bg-blue-500' },
  issue: { label: 'Issue', point: 'bg-rose-500' },
  alerte: { label: 'Alerte', point: 'bg-red-500' },
  manuel: { label: 'Note', point: 'bg-amber-400' },
};

export function typeActiviteLabel(type: string): string {
  return TYPES_ACTIVITE[type]?.label ?? type;
}

export function typeActivitePoint(type: string): string {
  return TYPES_ACTIVITE[type]?.point ?? 'bg-slate-400';
}
