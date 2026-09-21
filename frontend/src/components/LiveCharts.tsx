import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import type { SeriesPoint } from '../types';
import { formatCurrency, formatNumber, formatTime } from '../realtime/format';

const AXIS = { stroke: '#64748b', fontSize: 11 };
const GRID = '#1d2842';

const TOOLTIP_STYLE = {
  backgroundColor: '#0f1626',
  border: '1px solid #1d2842',
  borderRadius: '0.5rem',
  fontSize: '12px',
};

/**
 * Both charts are driven by the same rolling array of points the socket hook
 * maintains, so they always agree with each other and with the stat cards.
 *
 * isAnimationActive is off deliberately: with a point arriving every two
 * seconds, Recharts' enter animation would restart on every render and the
 * line would appear to twitch rather than advance.
 */
export function LiveCharts({ series }: { series: SeriesPoint[] }) {
  const data = series.map((point) => ({ ...point, label: formatTime(point.timestamp) }));

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <section
        aria-label="Revenue per minute"
        className="rounded-xl border border-surface-700 bg-surface-900 p-4"
      >
        <header className="mb-3">
          <h2 className="text-sm font-semibold text-white">Revenue (trailing minute)</h2>
          <p className="text-xs text-slate-500">Updated every 2 seconds over the live socket</p>
        </header>
        <div className="h-64">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={data} margin={{ top: 4, right: 8, bottom: 0, left: 8 }}>
              <defs>
                <linearGradient id="revenueFill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#38bdf8" stopOpacity={0.45} />
                  <stop offset="100%" stopColor="#38bdf8" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid stroke={GRID} vertical={false} />
              <XAxis dataKey="label" tick={AXIS} tickLine={false} axisLine={false} minTickGap={40} />
              <YAxis
                tick={AXIS}
                tickLine={false}
                axisLine={false}
                width={64}
                tickFormatter={(value: number) => formatCurrency(value)}
              />
              <Tooltip
                contentStyle={TOOLTIP_STYLE}
                labelStyle={{ color: '#94a3b8' }}
                formatter={(value: number) => [formatCurrency(value), 'Revenue']}
              />
              <Area
                type="monotone"
                dataKey="revenue"
                stroke="#38bdf8"
                strokeWidth={2}
                fill="url(#revenueFill)"
                isAnimationActive={false}
                dot={false}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </section>

      <section
        aria-label="Orders and signups"
        className="rounded-xl border border-surface-700 bg-surface-900 p-4"
      >
        <header className="mb-3">
          <h2 className="text-sm font-semibold text-white">Orders and signups per minute</h2>
          <p className="text-xs text-slate-500">Counts in the trailing 60 seconds</p>
        </header>
        <div className="h-64">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data} margin={{ top: 4, right: 8, bottom: 0, left: 8 }}>
              <CartesianGrid stroke={GRID} vertical={false} />
              <XAxis dataKey="label" tick={AXIS} tickLine={false} axisLine={false} minTickGap={40} />
              <YAxis
                tick={AXIS}
                tickLine={false}
                axisLine={false}
                width={40}
                allowDecimals={false}
                tickFormatter={(value: number) => formatNumber(value)}
              />
              <Tooltip contentStyle={TOOLTIP_STYLE} labelStyle={{ color: '#94a3b8' }} cursor={{ fill: '#1d284255' }} />
              <Legend wrapperStyle={{ fontSize: 12, color: '#94a3b8' }} />
              <Bar dataKey="orders" name="Orders" fill="#a78bfa" isAnimationActive={false} radius={[2, 2, 0, 0]} />
              <Bar dataKey="signups" name="Signups" fill="#34d399" isAnimationActive={false} radius={[2, 2, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </section>
    </div>
  );
}
