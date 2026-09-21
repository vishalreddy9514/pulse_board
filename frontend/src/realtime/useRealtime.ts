import { useCallback, useEffect, useRef, useState } from 'react';
import { io, type Socket } from 'socket.io-client';
import { WS_URL } from '../api/client';
import type { MetricAlert, MetricsSnapshot, PulseEvent, RealtimeSnapshot, SeriesPoint } from '../types';

/** Points held on the live charts: 120 ticks at 2s each is four minutes. */
const MAX_SERIES_POINTS = 120;
const MAX_FEED_EVENTS = 50;
const MAX_ALERT_HISTORY = 8;

export type ConnectionStatus = 'connecting' | 'live' | 'reconnecting' | 'unauthorized';

export interface RealtimeState {
  status: ConnectionStatus;
  metrics: MetricsSnapshot | null;
  series: SeriesPoint[];
  events: PulseEvent[];
  /** Alerts announced since this session connected, newest first. */
  alertHistory: MetricAlert[];
  /** Attempts made since the connection last dropped; shown in the UI. */
  reconnectAttempts: number;
}

const INITIAL_STATE: RealtimeState = {
  status: 'connecting',
  metrics: null,
  series: [],
  events: [],
  alertHistory: [],
  reconnectAttempts: 0,
};

/**
 * Owns the dashboard's socket connection.
 *
 * Reconnection is Socket.IO's exponential backoff rather than a hand-rolled
 * loop, with one important addition: the server replies to every successful
 * handshake with a full snapshot, and this hook *replaces* its state from that
 * snapshot instead of merging. A client that was offline for a minute therefore
 * comes back showing the truth, not a stale prefix with a gap in the middle.
 *
 * An invalid or expired token is a terminal condition, not something to retry:
 * reconnection is disabled and the caller is told to send the user back to the
 * login screen.
 */
export function useRealtime(token: string | null, onUnauthorized?: () => void): RealtimeState {
  const [state, setState] = useState<RealtimeState>(INITIAL_STATE);
  const socketRef = useRef<Socket | null>(null);
  const unauthorizedRef = useRef(onUnauthorized);
  unauthorizedRef.current = onUnauthorized;

  const reset = useCallback(() => setState(INITIAL_STATE), []);

  useEffect(() => {
    if (!token) {
      reset();
      return;
    }

    const socket = io(WS_URL, {
      transports: ['websocket', 'polling'],
      auth: { token },
      reconnection: true,
      reconnectionAttempts: Infinity,
      reconnectionDelay: 500,
      reconnectionDelayMax: 10_000,
      randomizationFactor: 0.5,
      timeout: 8000,
    });
    socketRef.current = socket;

    socket.on('connect', () => {
      setState((previous) => ({ ...previous, status: 'live', reconnectAttempts: 0 }));
    });

    socket.on('disconnect', (reason) => {
      setState((previous) => ({
        ...previous,
        // An explicit server-side disconnect is not retried by socket.io.
        status: reason === 'io server disconnect' ? 'unauthorized' : 'reconnecting',
      }));
    });

    socket.io.on('reconnect_attempt', (attempt: number) => {
      setState((previous) => ({ ...previous, status: 'reconnecting', reconnectAttempts: attempt }));
    });

    socket.on('connect_error', () => {
      setState((previous) => ({ ...previous, status: 'reconnecting' }));
    });

    socket.on('auth:error', () => {
      socket.io.opts.reconnection = false;
      setState((previous) => ({ ...previous, status: 'unauthorized' }));
      unauthorizedRef.current?.();
    });

    socket.on('snapshot', (snapshot: RealtimeSnapshot) => {
      setState((previous) => ({
        ...previous,
        status: 'live',
        metrics: snapshot.metrics,
        events: snapshot.events.slice(0, MAX_FEED_EVENTS),
        series: snapshot.series.slice(-MAX_SERIES_POINTS),
      }));
    });

    socket.on('event:new', (event: PulseEvent) => {
      setState((previous) => ({
        ...previous,
        events: [event, ...previous.events].slice(0, MAX_FEED_EVENTS),
      }));
    });

    socket.on('metrics:update', (payload: { metrics: MetricsSnapshot; point: SeriesPoint }) => {
      setState((previous) => ({
        ...previous,
        metrics: payload.metrics,
        series: [...previous.series, payload.point].slice(-MAX_SERIES_POINTS),
      }));
    });

    socket.on('alert:raised', (alert: MetricAlert) => {
      setState((previous) => ({
        ...previous,
        alertHistory: [alert, ...previous.alertHistory].slice(0, MAX_ALERT_HISTORY),
      }));
    });

    return () => {
      socket.removeAllListeners();
      socket.close();
      socketRef.current = null;
    };
  }, [token, reset]);

  return state;
}
