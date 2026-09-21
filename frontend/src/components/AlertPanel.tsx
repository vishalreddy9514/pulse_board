import type { MetricAlert } from '../types';
import { formatTime } from '../realtime/format';

/**
 * Two things are shown together on purpose: what is breached right now (from
 * the latest metrics tick) and what has been breached during this session
 * (pushed as alert:raised). The first tells an operator what to act on, the
 * second gives it context.
 */
export function AlertPanel({ active, history }: { active: MetricAlert[]; history: MetricAlert[] }) {
  const activeKeys = new Set(active.map((alert) => `${alert.metric}:${alert.direction}`));

  return (
    <section
      aria-label="Alerts"
      className="flex h-full flex-col rounded-xl border border-surface-700 bg-surface-900"
    >
      <header className="flex items-center justify-between border-b border-surface-700 px-4 py-3">
        <h2 className="text-sm font-semibold text-white">Alerts</h2>
        <span
          className={[
            'rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase',
            active.length > 0
              ? 'bg-metric-danger/15 text-metric-danger'
              : 'bg-metric-signups/10 text-metric-signups',
          ].join(' ')}
        >
          {active.length > 0 ? `${active.length} firing` : 'All clear'}
        </span>
      </header>

      <div className="flex-1 space-y-2 overflow-y-auto p-3">
        {active.length === 0 && history.length === 0 && (
          <p className="px-1 py-6 text-center text-xs text-slate-500">
            No thresholds crossed yet. Alerts appear here the moment a metric goes out of band.
          </p>
        )}

        {active.map((alert) => (
          <article
            key={`${alert.metric}-${alert.direction}`}
            data-testid="active-alert"
            className="rounded-lg border border-metric-danger/50 bg-metric-danger/10 px-3 py-2"
          >
            <div className="flex items-start justify-between gap-2">
              <p className="text-sm font-medium text-metric-danger">{alert.message}</p>
              <span className="shrink-0 font-mono text-[10px] uppercase text-metric-danger/80">
                {alert.severity}
              </span>
            </div>
            <p className="mt-1 font-mono text-[11px] text-slate-400">
              {alert.value.toLocaleString()} vs threshold {alert.threshold.toLocaleString()}
            </p>
          </article>
        ))}

        {history
          .filter((alert) => !activeKeys.has(`${alert.metric}:${alert.direction}`))
          .map((alert) => (
            <article
              key={alert.id}
              data-testid="past-alert"
              className="rounded-lg border border-surface-700 px-3 py-2 opacity-70"
            >
              <p className="text-xs text-slate-300">{alert.message}</p>
              <p className="mt-1 font-mono text-[10px] text-slate-500">
                cleared · raised at {formatTime(alert.raisedAt)}
              </p>
            </article>
          ))}
      </div>
    </section>
  );
}
