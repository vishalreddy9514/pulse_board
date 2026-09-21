import type { ConnectionStatus } from '../realtime/useRealtime';

const LABELS: Record<ConnectionStatus, { text: string; dot: string; tone: string }> = {
  connecting: { text: 'Connecting', dot: 'bg-slate-400', tone: 'text-slate-300' },
  live: { text: 'Live', dot: 'bg-metric-signups animate-pulse', tone: 'text-metric-signups' },
  reconnecting: { text: 'Reconnecting', dot: 'bg-metric-users animate-pulse', tone: 'text-metric-users' },
  unauthorized: { text: 'Signed out', dot: 'bg-metric-danger', tone: 'text-metric-danger' },
};

export function ConnectionBadge({
  status,
  attempts,
}: {
  status: ConnectionStatus;
  attempts: number;
}) {
  const label = LABELS[status];

  return (
    <span
      role="status"
      aria-live="polite"
      className={`inline-flex items-center gap-2 rounded-full border border-surface-700 bg-surface-900 px-3 py-1 text-xs font-medium ${label.tone}`}
    >
      <span className={`h-2 w-2 rounded-full ${label.dot}`} />
      {label.text}
      {status === 'reconnecting' && attempts > 0 && (
        <span className="text-slate-500">attempt {attempts}</span>
      )}
    </span>
  );
}
