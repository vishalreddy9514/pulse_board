import { useState } from 'react';
import { useAuth } from '../auth/AuthContext';
import { AlertPanel } from '../components/AlertPanel';
import { ConnectionBadge } from '../components/ConnectionBadge';
import { EventFeed } from '../components/EventFeed';
import { HistoricalView } from '../components/HistoricalView';
import { LiveCharts } from '../components/LiveCharts';
import { StatCard } from '../components/StatCard';
import { formatCurrency, formatNumber } from '../realtime/format';
import { useRealtime } from '../realtime/useRealtime';

type Tab = 'live' | 'history';

export function DashboardPage() {
  const { user, token, logout } = useAuth();
  const [tab, setTab] = useState<Tab>('live');
  // A socket rejected for a bad token means the session is over; drop straight
  // back to the login screen rather than showing a dashboard that cannot update.
  const realtime = useRealtime(token, logout);

  const metrics = realtime.metrics;
  const revenueAlerting = metrics?.alerts.some((alert) => alert.metric === 'revenue') ?? false;
  const ordersAlerting = metrics?.alerts.some((alert) => alert.metric === 'orders') ?? false;

  return (
    <div className="mx-auto flex min-h-full max-w-[1600px] flex-col gap-4 p-4 lg:p-6">
      <header className="flex flex-wrap items-center gap-3">
        <div>
          <h1 className="text-lg font-semibold text-white">PulseBoard</h1>
          <p className="text-xs text-slate-500">Streaming commerce metrics</p>
        </div>

        <div className="ml-2 flex rounded-lg border border-surface-700 p-0.5">
          {(['live', 'history'] as const).map((candidate) => (
            <button
              key={candidate}
              type="button"
              onClick={() => setTab(candidate)}
              className={[
                'rounded-md px-3 py-1 text-xs font-medium capitalize transition',
                tab === candidate ? 'bg-surface-700 text-white' : 'text-slate-400 hover:text-slate-200',
              ].join(' ')}
            >
              {candidate}
            </button>
          ))}
        </div>

        <div className="ml-auto flex items-center gap-3">
          <ConnectionBadge status={realtime.status} attempts={realtime.reconnectAttempts} />
          <span className="hidden text-xs text-slate-400 sm:inline">{user?.email}</span>
          <button
            type="button"
            onClick={logout}
            className="rounded-lg border border-surface-700 px-3 py-1 text-xs text-slate-400 hover:text-slate-200"
          >
            Sign out
          </button>
        </div>
      </header>

      {tab === 'live' ? (
        <div className="flex flex-1 flex-col gap-4">
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <StatCard
              label="Revenue / min"
              accent="revenue"
              alerting={revenueAlerting}
              value={metrics ? formatCurrency(metrics.revenueLast60s) : '—'}
              hint={metrics ? `${formatCurrency(metrics.totalRevenue)} all time` : 'waiting for data'}
            />
            <StatCard
              label="Orders / min"
              accent="orders"
              alerting={ordersAlerting}
              value={metrics ? formatNumber(metrics.ordersPerMin) : '—'}
              hint={metrics ? `${formatNumber(metrics.totalOrders)} orders all time` : 'waiting for data'}
            />
            <StatCard
              label="Active users"
              accent="users"
              value={metrics ? formatNumber(metrics.activeUsers) : '—'}
              hint="distinct users in the last 5 minutes"
            />
            <StatCard
              label="Signups / min"
              accent="signups"
              value={metrics ? formatNumber(metrics.signupsLast60s) : '—'}
              hint="new accounts in the trailing minute"
            />
          </div>

          <LiveCharts series={realtime.series} />

          <div className="grid flex-1 gap-4 lg:grid-cols-3">
            <div className="lg:col-span-2 h-[26rem]">
              <EventFeed events={realtime.events} />
            </div>
            <div className="h-[26rem]">
              <AlertPanel active={metrics?.alerts ?? []} history={realtime.alertHistory} />
            </div>
          </div>
        </div>
      ) : (
        token && <HistoricalView token={token} />
      )}
    </div>
  );
}
