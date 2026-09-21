import { useCallback, useEffect, useState } from 'react';
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { api } from '../api/client';
import { formatAxisTime, formatCurrency, formatNumber } from '../realtime/format';
import type { HistoryBucket, HistorySummary } from '../types';

/** Ranges are paired with a bucket width that keeps every chart around 60-120 points. */
const RANGES = [
  { id: '1h', label: 'Last hour', ms: 60 * 60 * 1000, bucketSeconds: 60 },
  { id: '6h', label: 'Last 6 hours', ms: 6 * 60 * 60 * 1000, bucketSeconds: 300 },
  { id: '24h', label: 'Last 24 hours', ms: 24 * 60 * 60 * 1000, bucketSeconds: 900 },
  { id: '7d', label: 'Last 7 days', ms: 7 * 24 * 60 * 60 * 1000, bucketSeconds: 3600 },
] as const;

type RangeId = (typeof RANGES)[number]['id'];

/**
 * The stored-data half of the dashboard. Nothing here touches the socket: it
 * queries the aggregation endpoint backed by Postgres, which is what makes the
 * app more than a live tail.
 */
export function HistoricalView({ token }: { token: string }) {
  const [rangeId, setRangeId] = useState<RangeId>('1h');
  const [buckets, setBuckets] = useState<HistoryBucket[]>([]);
  const [summary, setSummary] = useState<HistorySummary | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const range = RANGES.find((candidate) => candidate.id === rangeId) ?? RANGES[0];

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const to = new Date();
    const from = new Date(to.getTime() - range.ms);

    try {
      const [series, totals] = await Promise.all([
        api.historySeries(token, {
          from: from.toISOString(),
          to: to.toISOString(),
          bucketSeconds: range.bucketSeconds,
        }),
        api.historySummary(token, { from: from.toISOString(), to: to.toISOString() }),
      ]);
      setBuckets(series);
      setSummary(totals);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not load history');
    } finally {
      setLoading(false);
    }
  }, [token, range.ms, range.bucketSeconds]);

  useEffect(() => {
    void load();
  }, [load]);

  const data = buckets.map((bucket) => ({
    ...bucket,
    label: formatAxisTime(bucket.timestamp, range.bucketSeconds),
  }));

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        {RANGES.map((candidate) => (
          <button
            key={candidate.id}
            type="button"
            onClick={() => setRangeId(candidate.id)}
            className={[
              'rounded-lg border px-3 py-1.5 text-xs font-medium transition',
              candidate.id === rangeId
                ? 'border-metric-revenue bg-metric-revenue/10 text-metric-revenue'
                : 'border-surface-700 text-slate-400 hover:border-surface-600 hover:text-slate-200',
            ].join(' ')}
          >
            {candidate.label}
          </button>
        ))}
        <button
          type="button"
          onClick={() => void load()}
          className="ml-auto rounded-lg border border-surface-700 px-3 py-1.5 text-xs text-slate-400 hover:text-slate-200"
        >
          {loading ? 'Loading…' : 'Refresh'}
        </button>
      </div>

      {error && (
        <p role="alert" className="rounded-lg bg-red-500/10 px-3 py-2 text-sm text-metric-danger">
          {error}
        </p>
      )}

      {summary && (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <SummaryTile label="Revenue" value={formatCurrency(summary.totalRevenue)} />
          <SummaryTile label="Orders" value={formatNumber(summary.totalOrders)} />
          <SummaryTile label="Average order" value={formatCurrency(summary.averageOrderValue)} />
          <SummaryTile label="Unique users" value={formatNumber(summary.uniqueUsers)} />
        </div>
      )}

      <section className="rounded-xl border border-surface-700 bg-surface-900 p-4">
        <header className="mb-3">
          <h2 className="text-sm font-semibold text-white">Revenue from stored events</h2>
          <p className="text-xs text-slate-500">
            {range.label.toLowerCase()} · {range.bucketSeconds >= 3600
              ? `${range.bucketSeconds / 3600}h`
              : `${range.bucketSeconds / 60}m`}{' '}
            buckets · {buckets.length} points from Postgres
          </p>
        </header>
        <div className="h-72">
          {data.length === 0 && !loading ? (
            <p className="flex h-full items-center justify-center text-sm text-slate-500">
              No events recorded in this range yet.
            </p>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={data} margin={{ top: 4, right: 8, bottom: 0, left: 8 }}>
                <CartesianGrid stroke="#1d2842" vertical={false} />
                <XAxis
                  dataKey="label"
                  tick={{ stroke: '#64748b', fontSize: 11 }}
                  tickLine={false}
                  axisLine={false}
                  minTickGap={40}
                />
                <YAxis
                  yAxisId="left"
                  tick={{ stroke: '#64748b', fontSize: 11 }}
                  tickLine={false}
                  axisLine={false}
                  width={64}
                  tickFormatter={(value: number) => formatCurrency(value)}
                />
                <YAxis
                  yAxisId="right"
                  orientation="right"
                  tick={{ stroke: '#64748b', fontSize: 11 }}
                  tickLine={false}
                  axisLine={false}
                  width={40}
                  allowDecimals={false}
                />
                <Tooltip
                  contentStyle={{
                    backgroundColor: '#0f1626',
                    border: '1px solid #1d2842',
                    borderRadius: '0.5rem',
                    fontSize: '12px',
                  }}
                  labelStyle={{ color: '#94a3b8' }}
                />
                <Line
                  yAxisId="left"
                  type="monotone"
                  dataKey="revenue"
                  name="Revenue"
                  stroke="#38bdf8"
                  strokeWidth={2}
                  dot={false}
                />
                <Line
                  yAxisId="right"
                  type="monotone"
                  dataKey="orders"
                  name="Orders"
                  stroke="#a78bfa"
                  strokeWidth={2}
                  dot={false}
                />
              </LineChart>
            </ResponsiveContainer>
          )}
        </div>
      </section>
    </div>
  );
}

function SummaryTile({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-surface-700 bg-surface-900 p-4">
      <p className="text-xs font-medium uppercase tracking-wide text-slate-400">{label}</p>
      <p className="mt-1 font-mono text-xl font-semibold tabular-nums text-white">{value}</p>
    </div>
  );
}
