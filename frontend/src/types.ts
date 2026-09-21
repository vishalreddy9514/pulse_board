/** Mirrors backend/src/common/pulse-event.ts — the wire contract of the app. */
export type PulseEventType = 'order' | 'signup' | 'refund' | 'page_view';

export interface PulseEvent {
  id: string;
  type: PulseEventType;
  amount: number;
  userId: string;
  region: string;
  product: string | null;
  occurredAt: string;
}

export interface MetricAlert {
  id: string;
  metric: 'revenue' | 'orders';
  direction: 'above' | 'below';
  severity: 'warning' | 'critical';
  message: string;
  value: number;
  threshold: number;
  raisedAt: string;
}

export interface SeriesPoint {
  timestamp: string;
  revenue: number;
  orders: number;
  signups: number;
  activeUsers: number;
}

export interface MetricsSnapshot {
  timestamp: string;
  revenueLast60s: number;
  ordersLast60s: number;
  signupsLast60s: number;
  ordersPerMin: number;
  activeUsers: number;
  totalRevenue: number;
  totalOrders: number;
  alerts: MetricAlert[];
}

export interface RealtimeSnapshot {
  metrics: MetricsSnapshot;
  events: PulseEvent[];
  series: SeriesPoint[];
}

export interface HistoryBucket {
  timestamp: string;
  revenue: number;
  orders: number;
  signups: number;
  refunds: number;
  activeUsers: number;
}

export interface HistorySummary {
  totalRevenue: number;
  totalOrders: number;
  totalSignups: number;
  totalRefunds: number;
  averageOrderValue: number;
  uniqueUsers: number;
  firstEventAt: string | null;
  lastEventAt: string | null;
}

export interface AuthUser {
  id: string;
  email: string;
  createdAt: string;
}
