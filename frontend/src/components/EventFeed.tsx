import type { PulseEvent, PulseEventType } from '../types';
import { formatCurrencyPrecise, formatTime } from '../realtime/format';

const TYPE_STYLES: Record<PulseEventType, { label: string; className: string }> = {
  order: { label: 'ORDER', className: 'bg-metric-orders/15 text-metric-orders' },
  signup: { label: 'SIGNUP', className: 'bg-metric-signups/15 text-metric-signups' },
  refund: { label: 'REFUND', className: 'bg-metric-danger/15 text-metric-danger' },
  page_view: { label: 'VIEW', className: 'bg-slate-500/15 text-slate-300' },
};

/**
 * The live activity log. Only the newest row animates, which keeps the feed
 * readable: a list where everything moves at once is a list nobody can read.
 */
export function EventFeed({ events }: { events: PulseEvent[] }) {
  return (
    <section
      aria-label="Live event feed"
      className="flex h-full flex-col rounded-xl border border-surface-700 bg-surface-900"
    >
      <header className="flex items-center justify-between border-b border-surface-700 px-4 py-3">
        <h2 className="text-sm font-semibold text-white">Live events</h2>
        <span className="font-mono text-xs text-slate-500">last {events.length}</span>
      </header>

      <ul className="flex-1 divide-y divide-surface-800 overflow-y-auto">
        {events.length === 0 && (
          <li className="px-4 py-6 text-center text-xs text-slate-500">Waiting for events…</li>
        )}

        {events.map((event, index) => {
          const style = TYPE_STYLES[event.type];
          return (
            <li
              key={event.id}
              data-testid="feed-row"
              className={[
                'flex items-center gap-3 px-4 py-2 text-sm',
                index === 0 ? 'animate-flash-in' : '',
              ].join(' ')}
            >
              <span className="font-mono text-[11px] text-slate-500">
                {formatTime(event.occurredAt)}
              </span>
              <span
                className={`rounded px-1.5 py-0.5 text-[10px] font-semibold tracking-wide ${style.className}`}
              >
                {style.label}
              </span>
              <span className="truncate text-slate-300">
                {event.product ?? event.userId}
                <span className="ml-2 text-xs text-slate-500">{event.region}</span>
              </span>
              <span
                className={[
                  'ml-auto shrink-0 font-mono tabular-nums',
                  event.amount > 0
                    ? 'text-metric-signups'
                    : event.amount < 0
                      ? 'text-metric-danger'
                      : 'text-slate-600',
                ].join(' ')}
              >
                {event.amount === 0 ? '—' : formatCurrencyPrecise(event.amount)}
              </span>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
