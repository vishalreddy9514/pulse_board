import { Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'crypto';
import {
  MetricAlert,
  MetricsSnapshot,
  PulseEvent,
  SeriesPoint,
} from '../common/pulse-event';

const ACTIVE_USER_WINDOW_MS = 5 * 60 * 1000;
const RATE_WINDOW_MS = 60 * 1000;
/** Alerts stay quiet until the process has been watching for this long. */
const WARMUP_MS = 60 * 1000;

interface WindowEntry {
  type: PulseEvent['type'];
  amount: number;
  userId: string;
  at: number;
}

/**
 * Keeps the rolling picture of "right now" in memory.
 *
 * Trailing-window aggregates are deliberately not computed in Postgres: they
 * are recomputed several times a second for every connected client, and a
 * bounded in-memory window (5 minutes of events) answers them in microseconds
 * without putting a repeating scan on the database. Postgres remains the source
 * of truth for lifetime totals and for anything the historical view asks for.
 */
@Injectable()
export class MetricsService {
  private readonly window: WindowEntry[] = [];
  private readonly thresholds: { revenueSpike: number; revenueDrop: number; ordersSurge: number };
  private readonly startedAt = Date.now();

  private totalRevenue = 0;
  private totalOrders = 0;
  /** Alert ids currently active, so a sustained breach is not re-announced. */
  private activeAlertKeys = new Set<string>();

  constructor(@Inject(ConfigService) config: ConfigService) {
    this.thresholds = config.get('app.alerts') as MetricsService['thresholds'];
  }

  /** Seeds lifetime totals from Postgres so a restart does not reset the cards. */
  primeTotals(totalRevenue: number, totalOrders: number): void {
    this.totalRevenue = totalRevenue;
    this.totalOrders = totalOrders;
  }

  record(event: PulseEvent): void {
    const at = new Date(event.occurredAt).getTime();
    this.window.push({ type: event.type, amount: event.amount, userId: event.userId, at });
    this.totalRevenue += event.amount;
    if (event.type === 'order') this.totalOrders += 1;
    this.prune(Date.now());
  }

  snapshot(now = Date.now()): MetricsSnapshot {
    this.prune(now);

    const rateCutoff = now - RATE_WINDOW_MS;
    let revenueLast60s = 0;
    let ordersLast60s = 0;
    let signupsLast60s = 0;
    const activeUsers = new Set<string>();

    for (const entry of this.window) {
      if (entry.at >= now - ACTIVE_USER_WINDOW_MS) activeUsers.add(entry.userId);
      if (entry.at < rateCutoff) continue;
      revenueLast60s += entry.amount;
      if (entry.type === 'order') ordersLast60s += 1;
      if (entry.type === 'signup') signupsLast60s += 1;
    }

    return {
      timestamp: new Date(now).toISOString(),
      revenueLast60s: round2(revenueLast60s),
      ordersLast60s,
      signupsLast60s,
      ordersPerMin: ordersLast60s,
      activeUsers: activeUsers.size,
      totalRevenue: round2(this.totalRevenue),
      totalOrders: this.totalOrders,
      alerts: this.evaluateAlerts(round2(revenueLast60s), ordersLast60s, now),
    };
  }

  seriesPoint(snapshot: MetricsSnapshot): SeriesPoint {
    return {
      timestamp: snapshot.timestamp,
      revenue: snapshot.revenueLast60s,
      orders: snapshot.ordersLast60s,
      signups: snapshot.signupsLast60s,
      activeUsers: snapshot.activeUsers,
    };
  }

  /**
   * Returns the alerts that are currently breached. The second element of each
   * entry tells the caller whether this is a newly raised alert, which is what
   * the gateway uses to decide when to push an alert:raised message rather than
   * re-announcing a breach that has been going on for a minute.
   */
  takeNewlyRaised(alerts: MetricAlert[]): MetricAlert[] {
    const currentKeys = new Set(alerts.map((alert) => alertKey(alert)));
    const newly = alerts.filter((alert) => !this.activeAlertKeys.has(alertKey(alert)));
    this.activeAlertKeys = currentKeys;
    return newly;
  }

  private evaluateAlerts(revenue: number, orders: number, now: number): MetricAlert[] {
    const alerts: MetricAlert[] = [];
    const raisedAt = new Date(now).toISOString();
    const warmedUp = now - this.startedAt >= WARMUP_MS;

    if (revenue > this.thresholds.revenueSpike) {
      alerts.push({
        id: randomUUID(),
        metric: 'revenue',
        direction: 'above',
        severity: 'warning',
        message: `Revenue spike: $${revenue.toLocaleString()} in the last minute`,
        value: revenue,
        threshold: this.thresholds.revenueSpike,
        raisedAt,
      });
    }

    // A drop alert only makes sense once traffic has been flowing; otherwise
    // every cold start would fire one.
    if (warmedUp && revenue < this.thresholds.revenueDrop) {
      alerts.push({
        id: randomUUID(),
        metric: 'revenue',
        direction: 'below',
        severity: 'critical',
        message: `Revenue drop: only $${revenue.toLocaleString()} in the last minute`,
        value: revenue,
        threshold: this.thresholds.revenueDrop,
        raisedAt,
      });
    }

    if (orders > this.thresholds.ordersSurge) {
      alerts.push({
        id: randomUUID(),
        metric: 'orders',
        direction: 'above',
        severity: 'warning',
        message: `Order surge: ${orders} orders/min`,
        value: orders,
        threshold: this.thresholds.ordersSurge,
        raisedAt,
      });
    }

    return alerts;
  }

  private prune(now: number): void {
    const cutoff = now - ACTIVE_USER_WINDOW_MS;
    while (this.window.length > 0 && this.window[0].at < cutoff) {
      this.window.shift();
    }
  }
}

function alertKey(alert: MetricAlert): string {
  return `${alert.metric}:${alert.direction}`;
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}
