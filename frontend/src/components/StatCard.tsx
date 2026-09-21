import type { ReactNode } from 'react';

export interface StatCardProps {
  label: string;
  value: string;
  hint?: string;
  accent: 'revenue' | 'orders' | 'signups' | 'users';
  /** Raised when the metric is currently breaching a threshold. */
  alerting?: boolean;
  icon?: ReactNode;
}

const ACCENTS: Record<StatCardProps['accent'], string> = {
  revenue: 'text-metric-revenue',
  orders: 'text-metric-orders',
  signups: 'text-metric-signups',
  users: 'text-metric-users',
};

export function StatCard({ label, value, hint, accent, alerting }: StatCardProps) {
  return (
    <div
      data-testid={`stat-${accent}`}
      className={[
        'rounded-xl border bg-surface-900 p-4 transition-colors',
        alerting ? 'border-metric-danger/70 bg-red-500/5' : 'border-surface-700',
      ].join(' ')}
    >
      <div className="flex items-center justify-between">
        <p className="text-xs font-medium uppercase tracking-wide text-slate-400">{label}</p>
        {alerting && (
          <span className="rounded-full bg-metric-danger/15 px-2 py-0.5 text-[10px] font-semibold uppercase text-metric-danger">
            Alert
          </span>
        )}
      </div>
      <p className={`mt-2 font-mono text-2xl font-semibold tabular-nums ${ACCENTS[accent]}`}>
        {value}
      </p>
      {hint && <p className="mt-1 text-xs text-slate-500">{hint}</p>}
    </div>
  );
}
