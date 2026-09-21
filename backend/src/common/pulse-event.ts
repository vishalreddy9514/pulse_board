/**
 * The event contract shared by the producer, the backend and the dashboard.
 * The producer publishes these to Redis; the backend persists them and fans
 * them out over Socket.IO unchanged, so there is exactly one shape to reason
 * about end to end.
 */
export type PulseEventType = 'order' | 'signup' | 'refund' | 'page_view';

export interface PulseEvent {
  id: string;
  type: PulseEventType;
  /** Revenue impact in USD. Positive for orders, negative for refunds, 0 otherwise. */
  amount: number;
  /** Stable pseudo-user id; used to derive the active-user count. */
  userId: string;
  region: string;
  product: string | null;
  occurredAt: string;
}

export type AlertMetric = 'revenue' | 'orders';
export type AlertDirection = 'above' | 'below';

export interface MetricAlert {
  id: string;
  metric: AlertMetric;
  direction: AlertDirection;
  severity: 'warning' | 'critical';
  message: string;
  value: number;
  threshold: number;
  raisedAt: string;
}

/** A single point on the live charts. One point per tick. */
export interface SeriesPoint {
  timestamp: string;
  revenue: number;
  orders: number;
  signups: number;
  activeUsers: number;
}

export interface MetricsSnapshot {
  timestamp: string;
  /** Revenue booked in the trailing 60 seconds. */
  revenueLast60s: number;
  ordersLast60s: number;
  signupsLast60s: number;
  /** Orders in the trailing 60s, which is already a per-minute rate. */
  ordersPerMin: number;
  /** Distinct users seen in the trailing 5 minutes. */
  activeUsers: number;
  /** Lifetime totals, read from Postgres so they survive a restart. */
  totalRevenue: number;
  totalOrders: number;
  alerts: MetricAlert[];
}

/** What a client receives immediately after a successful socket handshake. */
export interface RealtimeSnapshot {
  metrics: MetricsSnapshot;
  events: PulseEvent[];
  series: SeriesPoint[];
}

/** Names of every server -> client Socket.IO message. */
export const RealtimeEvents = {
  Snapshot: 'snapshot',
  EventNew: 'event:new',
  MetricsUpdate: 'metrics:update',
  AlertRaised: 'alert:raised',
} as const;
