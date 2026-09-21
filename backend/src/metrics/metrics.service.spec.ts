import { ConfigService } from '@nestjs/config';
import { MetricsService } from './metrics.service';
import { PulseEvent, PulseEventType } from '../common/pulse-event';

const THRESHOLDS = { revenueSpike: 1000, revenueDrop: 100, ordersSurge: 5 };

function build(): MetricsService {
  const config = { get: () => THRESHOLDS } as unknown as ConfigService;
  return new MetricsService(config);
}

function event(overrides: Partial<PulseEvent> & { type: PulseEventType }): PulseEvent {
  return {
    id: Math.random().toString(36).slice(2),
    amount: 0,
    userId: 'user_1',
    region: 'us-east',
    product: null,
    occurredAt: new Date().toISOString(),
    ...overrides,
  };
}

describe('MetricsService', () => {
  it('starts empty', () => {
    const snapshot = build().snapshot();

    expect(snapshot.revenueLast60s).toBe(0);
    expect(snapshot.ordersLast60s).toBe(0);
    expect(snapshot.activeUsers).toBe(0);
    expect(snapshot.alerts).toEqual([]);
  });

  it('aggregates revenue, orders and signups over the trailing minute', () => {
    const metrics = build();
    metrics.record(event({ type: 'order', amount: 120.5 }));
    metrics.record(event({ type: 'order', amount: 79.5 }));
    metrics.record(event({ type: 'signup' }));
    metrics.record(event({ type: 'page_view' }));

    const snapshot = metrics.snapshot();

    expect(snapshot.revenueLast60s).toBe(200);
    expect(snapshot.ordersLast60s).toBe(2);
    expect(snapshot.signupsLast60s).toBe(1);
    expect(snapshot.ordersPerMin).toBe(2);
  });

  it('subtracts refunds from revenue', () => {
    const metrics = build();
    metrics.record(event({ type: 'order', amount: 300 }));
    metrics.record(event({ type: 'refund', amount: -100 }));

    expect(metrics.snapshot().revenueLast60s).toBe(200);
  });

  it('drops events older than the rate window from per-minute figures', () => {
    const metrics = build();
    const now = Date.now();
    metrics.record(
      event({ type: 'order', amount: 500, occurredAt: new Date(now - 90_000).toISOString() }),
    );
    metrics.record(event({ type: 'order', amount: 25, occurredAt: new Date(now).toISOString() }));

    const snapshot = metrics.snapshot(now);

    expect(snapshot.revenueLast60s).toBe(25);
    expect(snapshot.ordersLast60s).toBe(1);
    // ...but lifetime totals keep both.
    expect(snapshot.totalRevenue).toBe(525);
    expect(snapshot.totalOrders).toBe(2);
  });

  it('counts distinct users over five minutes, not per event', () => {
    const metrics = build();
    const now = Date.now();
    metrics.record(event({ type: 'page_view', userId: 'a', occurredAt: new Date(now).toISOString() }));
    metrics.record(event({ type: 'page_view', userId: 'a', occurredAt: new Date(now).toISOString() }));
    metrics.record(event({ type: 'page_view', userId: 'b', occurredAt: new Date(now).toISOString() }));
    metrics.record(
      event({ type: 'page_view', userId: 'stale', occurredAt: new Date(now - 6 * 60_000).toISOString() }),
    );

    expect(metrics.snapshot(now).activeUsers).toBe(2);
  });

  it('seeds lifetime totals from storage', () => {
    const metrics = build();
    metrics.primeTotals(10_000, 42);
    metrics.record(event({ type: 'order', amount: 100 }));

    const snapshot = metrics.snapshot();

    expect(snapshot.totalRevenue).toBe(10_100);
    expect(snapshot.totalOrders).toBe(43);
  });

  describe('alerting', () => {
    it('raises a revenue spike above the threshold', () => {
      const metrics = build();
      metrics.record(event({ type: 'order', amount: 1500 }));

      const [alert] = metrics.snapshot().alerts;

      expect(alert).toMatchObject({ metric: 'revenue', direction: 'above', severity: 'warning' });
      expect(alert.value).toBe(1500);
      expect(alert.threshold).toBe(1000);
    });

    it('raises an order surge above the threshold', () => {
      const metrics = build();
      for (let index = 0; index < 6; index += 1) {
        metrics.record(event({ type: 'order', amount: 1 }));
      }

      expect(metrics.snapshot().alerts).toContainEqual(
        expect.objectContaining({ metric: 'orders', direction: 'above' }),
      );
    });

    it('stays quiet about a revenue drop during warm-up', () => {
      // Nothing has been recorded, so revenue is below the drop threshold — but
      // a process that just started has no business claiming revenue collapsed.
      expect(build().snapshot().alerts).toEqual([]);
    });

    it('raises a revenue drop once warmed up', () => {
      const metrics = build();
      const later = Date.now() + 61_000;

      expect(metrics.snapshot(later).alerts).toContainEqual(
        expect.objectContaining({ metric: 'revenue', direction: 'below', severity: 'critical' }),
      );
    });

    it('announces a breach once rather than on every tick', () => {
      const metrics = build();
      metrics.record(event({ type: 'order', amount: 1500 }));

      const first = metrics.snapshot().alerts;
      expect(metrics.takeNewlyRaised(first)).toHaveLength(1);

      const second = metrics.snapshot().alerts;
      expect(metrics.takeNewlyRaised(second)).toHaveLength(0);
    });

    it('re-announces a breach that cleared and came back', () => {
      const metrics = build();
      const now = Date.now();
      metrics.record(event({ type: 'order', amount: 1500, occurredAt: new Date(now).toISOString() }));
      metrics.takeNewlyRaised(metrics.snapshot(now).alerts);

      // A minute later the spike has aged out of the window.
      const cleared = now + 61_000;
      metrics.takeNewlyRaised(metrics.snapshot(cleared).alerts);

      metrics.record(event({ type: 'order', amount: 1500, occurredAt: new Date(cleared).toISOString() }));
      expect(metrics.takeNewlyRaised(metrics.snapshot(cleared).alerts)).toContainEqual(
        expect.objectContaining({ metric: 'revenue', direction: 'above' }),
      );
    });
  });

  it('projects a snapshot onto a chart point', () => {
    const metrics = build();
    metrics.record(event({ type: 'order', amount: 42 }));
    const snapshot = metrics.snapshot();

    expect(metrics.seriesPoint(snapshot)).toEqual({
      timestamp: snapshot.timestamp,
      revenue: 42,
      orders: 1,
      signups: 0,
      activeUsers: 1,
    });
  });
});
