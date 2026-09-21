import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';
import { PulseEvent, PulseEventType } from '../common/pulse-event';

export interface HistoryRange {
  from: Date;
  to: Date;
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

export interface EventQuery extends HistoryRange {
  type?: PulseEventType;
  limit: number;
  offset: number;
}

@Injectable()
export class EventsRepository {
  constructor(private readonly db: DatabaseService) {}

  /**
   * Multi-row insert. The ingest path batches events and calls this once per
   * flush, so a busy stream costs one round trip per batch rather than one per
   * event. ON CONFLICT DO NOTHING makes redelivery of an event id harmless.
   */
  async insertMany(events: PulseEvent[]): Promise<void> {
    if (events.length === 0) return;

    // One placeholder per column: id, type, amount, user_id, region, product,
    // occurred_at. This must match the value list below exactly, or rows after
    // the first in a batch get their parameters shifted.
    const columns = 7;
    const values: unknown[] = [];
    const placeholders = events.map((event, index) => {
      const base = index * columns;
      values.push(
        event.id,
        event.type,
        event.amount,
        event.userId,
        event.region,
        event.product,
        event.occurredAt,
      );
      return `($${base + 1}, $${base + 2}, $${base + 3}, $${base + 4}, $${base + 5}, $${base + 6}, $${base + 7})`;
    });

    await this.db.query(
      `INSERT INTO events (id, type, amount, user_id, region, product, occurred_at)
       VALUES ${placeholders.join(', ')}
       ON CONFLICT (id) DO NOTHING`,
      values,
    );
  }

  async lifetimeTotals(): Promise<{ totalRevenue: number; totalOrders: number }> {
    const [row] = await this.db.query<{ total_revenue: string; total_orders: string }>(
      `SELECT COALESCE(SUM(amount), 0) AS total_revenue,
              COUNT(*) FILTER (WHERE type = 'order') AS total_orders
         FROM events`,
    );
    return {
      totalRevenue: Number(row?.total_revenue ?? 0),
      totalOrders: Number(row?.total_orders ?? 0),
    };
  }

  /**
   * Time-bucketed aggregation. Buckets are derived from the epoch seconds so
   * any bucket width works without a TimescaleDB dependency.
   */
  async series(range: HistoryRange, bucketSeconds: number): Promise<HistoryBucket[]> {
    const rows = await this.db.query<{
      bucket: Date;
      revenue: string;
      orders: string;
      signups: string;
      refunds: string;
      active_users: string;
    }>(
      `SELECT to_timestamp(floor(extract(epoch FROM occurred_at) / $3) * $3) AS bucket,
              COALESCE(SUM(amount), 0)                       AS revenue,
              COUNT(*) FILTER (WHERE type = 'order')         AS orders,
              COUNT(*) FILTER (WHERE type = 'signup')        AS signups,
              COUNT(*) FILTER (WHERE type = 'refund')        AS refunds,
              COUNT(DISTINCT user_id)                        AS active_users
         FROM events
        WHERE occurred_at >= $1 AND occurred_at < $2
        GROUP BY bucket
        ORDER BY bucket ASC`,
      [range.from, range.to, bucketSeconds],
    );

    return rows.map((row) => ({
      timestamp: row.bucket.toISOString(),
      revenue: Number(row.revenue),
      orders: Number(row.orders),
      signups: Number(row.signups),
      refunds: Number(row.refunds),
      activeUsers: Number(row.active_users),
    }));
  }

  async summary(range: HistoryRange): Promise<HistorySummary> {
    const [row] = await this.db.query<Record<string, string | Date | null>>(
      `SELECT COALESCE(SUM(amount), 0)                                  AS total_revenue,
              COUNT(*) FILTER (WHERE type = 'order')                    AS total_orders,
              COUNT(*) FILTER (WHERE type = 'signup')                   AS total_signups,
              COUNT(*) FILTER (WHERE type = 'refund')                   AS total_refunds,
              COALESCE(AVG(amount) FILTER (WHERE type = 'order'), 0)    AS average_order_value,
              COUNT(DISTINCT user_id)                                   AS unique_users,
              MIN(occurred_at)                                          AS first_event_at,
              MAX(occurred_at)                                          AS last_event_at
         FROM events
        WHERE occurred_at >= $1 AND occurred_at < $2`,
      [range.from, range.to],
    );

    return {
      totalRevenue: Number(row?.total_revenue ?? 0),
      totalOrders: Number(row?.total_orders ?? 0),
      totalSignups: Number(row?.total_signups ?? 0),
      totalRefunds: Number(row?.total_refunds ?? 0),
      averageOrderValue: Number(row?.average_order_value ?? 0),
      uniqueUsers: Number(row?.unique_users ?? 0),
      firstEventAt: asIso(row?.first_event_at),
      lastEventAt: asIso(row?.last_event_at),
    };
  }

  async list(query: EventQuery): Promise<PulseEvent[]> {
    const params: unknown[] = [query.from, query.to];
    let typeClause = '';
    if (query.type) {
      params.push(query.type);
      typeClause = `AND type = $${params.length}`;
    }
    params.push(query.limit, query.offset);

    const rows = await this.db.query<{
      id: string;
      type: PulseEventType;
      amount: string;
      user_id: string;
      region: string;
      product: string | null;
      occurred_at: Date;
    }>(
      `SELECT id, type, amount, user_id, region, product, occurred_at
         FROM events
        WHERE occurred_at >= $1 AND occurred_at < $2 ${typeClause}
        ORDER BY occurred_at DESC
        LIMIT $${params.length - 1} OFFSET $${params.length}`,
      params,
    );

    return rows.map((row) => ({
      id: row.id,
      type: row.type,
      amount: Number(row.amount),
      userId: row.user_id,
      region: row.region,
      product: row.product,
      occurredAt: row.occurred_at.toISOString(),
    }));
  }
}

function asIso(value: string | Date | null | undefined): string | null {
  if (!value) return null;
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}
