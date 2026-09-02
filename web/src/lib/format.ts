// lib/format.ts — formatage fr-BE des montants, dates et durées.
// Les montants arrivent en number (le serveur caste en ::float8).

const montantFormatter = new Intl.NumberFormat('fr-BE', {
  style: 'currency',
  currency: 'EUR',
});

export function formatMontant(valeur: number | null | undefined): string {
  return montantFormatter.format(valeur ?? 0);
}

const dateFormatter = new Intl.DateTimeFormat('fr-BE', {
  day: '2-digit',
  month: 'short',
  year: 'numeric',
});

const dateTimeFormatter = new Intl.DateTimeFormat('fr-BE', {
  day: '2-digit',
  month: 'short',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
});

export function formatDate(iso: string | null | undefined): string {
  if (!iso) return '—';
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? '—' : dateFormatter.format(date);
}

export function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return '—';
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? '—' : dateTimeFormatter.format(date);
}

const relatif = new Intl.RelativeTimeFormat('fr', { numeric: 'auto' });

/** "il y a 3 h", "hier", "il y a 12 j"… puis la date au-delà de 30 jours. */
export function formatRelative(iso: string | null | undefined): string {
  if (!iso) return '—';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '—';

  const diffMinutes = Math.round((date.getTime() - Date.now()) / 60_000);
  if (Math.abs(diffMinutes) < 60) return relatif.format(diffMinutes, 'minute');
  const diffHours = Math.round(diffMinutes / 60);
  if (Math.abs(diffHours) < 24) return relatif.format(diffHours, 'hour');
  const diffDays = Math.round(diffHours / 24);
  if (Math.abs(diffDays) < 30) return relatif.format(diffDays, 'day');
  return formatDate(iso);
}

/** Jours calendaires entre aujourd'hui et une échéance 'YYYY-MM-DD'. */
export function joursAvantEcheance(dateEcheance: string | null | undefined): number | null {
  if (!dateEcheance) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const echeance = new Date(`${dateEcheance}T00:00:00`);
  if (Number.isNaN(echeance.getTime())) return null;
  return Math.round((echeance.getTime() - today.getTime()) / 86_400_000);
}
