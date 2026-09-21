import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useRealtime } from '../useRealtime';
import type { MetricsSnapshot, PulseEvent, SeriesPoint } from '../../types';

/**
 * A stand-in for a socket.io client: handlers registered by the hook can be
 * fired by the test, which lets the reconnection and snapshot behaviour be
 * exercised without a server.
 */
class FakeSocket {
  handlers = new Map<string, (payload?: unknown) => void>();
  managerHandlers = new Map<string, (payload?: unknown) => void>();
  closed = false;
  opts = { reconnection: true };
  io = {
    on: (event: string, handler: (payload?: unknown) => void) => {
      this.managerHandlers.set(event, handler);
    },
    opts: this.opts,
  };

  on(event: string, handler: (payload?: unknown) => void) {
    this.handlers.set(event, handler);
  }

  removeAllListeners() {
    this.handlers.clear();
  }

  close() {
    this.closed = true;
  }

  fire(event: string, payload?: unknown) {
    this.handlers.get(event)?.(payload);
  }

  fireManager(event: string, payload?: unknown) {
    this.managerHandlers.get(event)?.(payload);
  }
}

let socket: FakeSocket;

vi.mock('socket.io-client', () => ({
  io: vi.fn(() => socket),
}));

function metrics(revenue: number): MetricsSnapshot {
  return {
    timestamp: '2026-09-21T12:00:00.000Z',
    revenueLast60s: revenue,
    ordersLast60s: 3,
    signupsLast60s: 1,
    ordersPerMin: 3,
    activeUsers: 12,
    totalRevenue: revenue,
    totalOrders: 3,
    alerts: [],
  };
}

function point(revenue: number): SeriesPoint {
  return { timestamp: '2026-09-21T12:00:02.000Z', revenue, orders: 1, signups: 0, activeUsers: 12 };
}

function event(id: string): PulseEvent {
  return {
    id,
    type: 'order',
    amount: 10,
    userId: 'user_1',
    region: 'us-east',
    product: 'Pro Plan',
    occurredAt: '2026-09-21T12:00:01.000Z',
  };
}

describe('useRealtime', () => {
  beforeEach(() => {
    socket = new FakeSocket();
  });

  it('stays idle without a token', () => {
    const { result } = renderHook(() => useRealtime(null));

    expect(result.current.status).toBe('connecting');
    expect(result.current.metrics).toBeNull();
  });

  it('reports live once connected and populates from the snapshot', async () => {
    const { result } = renderHook(() => useRealtime('token'));

    act(() => {
      socket.fire('connect');
      socket.fire('snapshot', { metrics: metrics(100), events: [event('a')], series: [point(100)] });
    });

    await waitFor(() => expect(result.current.status).toBe('live'));
    expect(result.current.metrics?.revenueLast60s).toBe(100);
    expect(result.current.events).toHaveLength(1);
    expect(result.current.series).toHaveLength(1);
  });

  it('prepends live events, newest first', () => {
    const { result } = renderHook(() => useRealtime('token'));

    act(() => {
      socket.fire('snapshot', { metrics: metrics(0), events: [event('old')], series: [] });
      socket.fire('event:new', event('new'));
    });

    expect(result.current.events.map((item) => item.id)).toEqual(['new', 'old']);
  });

  it('appends metric ticks to the chart series', () => {
    const { result } = renderHook(() => useRealtime('token'));

    act(() => {
      socket.fire('snapshot', { metrics: metrics(0), events: [], series: [point(1)] });
      socket.fire('metrics:update', { metrics: metrics(250), point: point(250) });
    });

    expect(result.current.metrics?.revenueLast60s).toBe(250);
    expect(result.current.series.map((item) => item.revenue)).toEqual([1, 250]);
  });

  it('caps the chart series so memory does not grow without bound', () => {
    const { result } = renderHook(() => useRealtime('token'));

    act(() => {
      socket.fire('snapshot', { metrics: metrics(0), events: [], series: [] });
      for (let index = 0; index < 150; index += 1) {
        socket.fire('metrics:update', { metrics: metrics(index), point: point(index) });
      }
    });

    expect(result.current.series).toHaveLength(120);
    // The oldest points are the ones dropped.
    expect(result.current.series[0].revenue).toBe(30);
  });

  it('shows reconnecting with the attempt count when the connection drops', () => {
    const { result } = renderHook(() => useRealtime('token'));

    act(() => {
      socket.fire('connect');
      socket.fire('disconnect', 'transport close');
      socket.fireManager('reconnect_attempt', 3);
    });

    expect(result.current.status).toBe('reconnecting');
    expect(result.current.reconnectAttempts).toBe(3);
  });

  it('replaces state from the snapshot after a reconnect rather than merging a stale prefix', () => {
    const { result } = renderHook(() => useRealtime('token'));

    act(() => {
      socket.fire('snapshot', { metrics: metrics(100), events: [event('before')], series: [point(1)] });
      socket.fire('disconnect', 'transport close');
      socket.fire('connect');
      socket.fire('snapshot', {
        metrics: metrics(900),
        events: [event('after')],
        series: [point(9)],
      });
    });

    expect(result.current.status).toBe('live');
    expect(result.current.metrics?.revenueLast60s).toBe(900);
    expect(result.current.events.map((item) => item.id)).toEqual(['after']);
    expect(result.current.series.map((item) => item.revenue)).toEqual([9]);
  });

  it('stops retrying and signals the caller when the token is refused', () => {
    const onUnauthorized = vi.fn();
    const { result } = renderHook(() => useRealtime('expired-token', onUnauthorized));

    act(() => {
      socket.fire('auth:error', { message: 'invalid token' });
    });

    expect(result.current.status).toBe('unauthorized');
    expect(socket.opts.reconnection).toBe(false);
    expect(onUnauthorized).toHaveBeenCalledTimes(1);
  });

  it('closes the socket when the component unmounts', () => {
    const { unmount } = renderHook(() => useRealtime('token'));

    unmount();

    expect(socket.closed).toBe(true);
  });
});
