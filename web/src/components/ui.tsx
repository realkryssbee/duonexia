// components/ui.tsx — petits composants de présentation partagés.
import type { ReactNode } from 'react';
import { statutClientClasses, statutClientLabel, statutProjetClasses, statutProjetLabel } from '../lib/labels';

export function Card({ children, className = '' }: { children: ReactNode; className?: string }) {
  return (
    <div className={`rounded-xl border border-slate-200 bg-white shadow-sm ${className}`}>
      {children}
    </div>
  );
}

export function CardHeader({
  title,
  subtitle,
  right,
}: {
  title: string;
  subtitle?: string;
  right?: ReactNode;
}) {
  return (
    <div className="flex items-start justify-between gap-3 border-b border-slate-100 px-4 py-3">
      <div>
        <h2 className="text-sm font-semibold text-slate-800">{title}</h2>
        {subtitle && <p className="mt-0.5 text-xs text-slate-500">{subtitle}</p>}
      </div>
      {right}
    </div>
  );
}

export function Badge({ children, className = '' }: { children: ReactNode; className?: string }) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${className}`}
    >
      {children}
    </span>
  );
}

export function StatutProjetBadge({ statut }: { statut: string }) {
  return <Badge className={statutProjetClasses(statut)}>{statutProjetLabel(statut)}</Badge>;
}

export function StatutClientBadge({ statut }: { statut: string }) {
  return <Badge className={statutClientClasses(statut)}>{statutClientLabel(statut)}</Badge>;
}

export function ErreurPanel({ message }: { message: string }) {
  return (
    <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
      {message}
    </div>
  );
}

export function Chargement() {
  return (
    <div className="flex items-center justify-center py-16 text-sm text-slate-500">
      <span className="mr-2 inline-block h-4 w-4 animate-spin rounded-full border-2 border-slate-300 border-t-indigo-600 align-middle" />
      Chargement…
    </div>
  );
}

export function Vide({ children }: { children: ReactNode }) {
  return <div className="px-4 py-6 text-center text-sm text-slate-400">{children}</div>;
}
