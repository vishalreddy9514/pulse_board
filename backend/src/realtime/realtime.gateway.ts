import { Inject, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  OnGatewayConnection,
  OnGatewayDisconnect,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { Subscription } from 'rxjs';
import { AuthService } from '../auth/auth.service';
import { MetricsSnapshot, RealtimeEvents, SeriesPoint } from '../common/pulse-event';
import { EventStream } from '../events/event-stream';
import { EventsService } from '../events/events.service';
import { MetricsService } from '../metrics/metrics.service';
import { RedisService } from '../redis/redis.service';

/** How often the aggregate cards and charts are pushed to every dashboard. */
const TICK_MS = 2000;
/** History used to seed a freshly connected client's charts. */
const SEED_WINDOW_MS = 15 * 60 * 1000;
const SEED_BUCKET_SECONDS = 30;

const DASHBOARD_ROOM = 'dashboard';

/**
 * The push side of the system.
 *
 * Individual events are forwarded the moment they arrive, because a feed that
 * lags is a feed nobody trusts. Aggregates are pushed on a fixed 2s tick
 * instead of per event: recomputing and broadcasting summary numbers hundreds
 * of times a second would spend CPU and bandwidth on frames no human can read.
 *
 * Authentication happens once, during the handshake. An unauthenticated socket
 * is disconnected before it can join the room, so no event data is ever written
 * to a connection that has not presented a valid JWT.
 */
@WebSocketGateway({
  cors: { origin: true, credentials: true },
  // Websocket first, long-polling kept as a fallback for hostile networks.
  transports: ['websocket', 'polling'],
})
export class RealtimeGateway
  implements OnGatewayConnection, OnGatewayDisconnect, OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(RealtimeGateway.name);
  private tickTimer?: NodeJS.Timeout;
  private subscription?: Subscription;

  @WebSocketServer()
  server!: Server;

  constructor(
    private readonly auth: AuthService,
    private readonly metrics: MetricsService,
    private readonly stream: EventStream,
    private readonly events: EventsService,
    private readonly redis: RedisService,
    @Inject(ConfigService) private readonly config: ConfigService,
  ) {}

  onModuleInit(): void {
    this.subscription = this.stream.events$.subscribe((event) => {
      this.server?.to(DASHBOARD_ROOM).emit(RealtimeEvents.EventNew, event);
    });

    this.tickTimer = setInterval(() => this.broadcastMetrics(), TICK_MS);
  }

  onModuleDestroy(): void {
    if (this.tickTimer) clearInterval(this.tickTimer);
    this.subscription?.unsubscribe();
  }

  async handleConnection(client: Socket): Promise<void> {
    const token = extractToken(client);
    if (!token) {
      this.reject(client, 'missing token');
      return;
    }

    try {
      const payload = await this.auth.verify(token);
      client.data.user = payload;
      await client.join(DASHBOARD_ROOM);
      this.logger.log(`${payload.email} connected (${client.id})`);
      await this.sendSnapshot(client);
    } catch {
      this.reject(client, 'invalid token');
    }
  }

  handleDisconnect(client: Socket): void {
    const email = client.data?.user?.email;
    if (email) this.logger.log(`${email} disconnected (${client.id})`);
  }

  /**
   * A reconnecting client gets the same picture a long-lived one has: current
   * aggregates, the recent event feed out of Redis, and enough history for the
   * charts to render a line rather than a single point.
   */
  private async sendSnapshot(client: Socket): Promise<void> {
    const snapshot = this.metrics.snapshot();
    const [cachedEvents, history] = await Promise.all([
      this.redis.getCachedEvents().catch(() => []),
      this.events.recentSeries(SEED_WINDOW_MS, SEED_BUCKET_SECONDS).catch(() => []),
    ]);

    const series: SeriesPoint[] = history.map((bucket) => ({
      timestamp: bucket.timestamp,
      revenue: bucket.revenue,
      orders: bucket.orders,
      signups: bucket.signups,
      activeUsers: bucket.activeUsers,
    }));

    client.emit(RealtimeEvents.Snapshot, {
      metrics: snapshot,
      events: cachedEvents,
      series,
    });
  }

  private broadcastMetrics(): void {
    if (!this.server) return;

    const snapshot: MetricsSnapshot = this.metrics.snapshot();
    this.server.to(DASHBOARD_ROOM).emit(RealtimeEvents.MetricsUpdate, {
      metrics: snapshot,
      point: this.metrics.seriesPoint(snapshot),
    });

    // Only announce a breach the first time it is seen, so a sustained
    // condition does not spam the alert panel every two seconds.
    for (const alert of this.metrics.takeNewlyRaised(snapshot.alerts)) {
      this.server.to(DASHBOARD_ROOM).emit(RealtimeEvents.AlertRaised, alert);
    }
  }

  private reject(client: Socket, reason: string): void {
    this.logger.warn(`Rejected socket ${client.id}: ${reason}`);
    client.emit('auth:error', { message: reason });
    client.disconnect(true);
  }
}

/**
 * Accepts the token from handshake.auth (what socket.io-client sends), from an
 * Authorization header (what a proxy or a non-browser client may send), or from
 * a query parameter (last resort for tooling that cannot set either).
 */
function extractToken(client: Socket): string | null {
  const fromAuth = client.handshake.auth?.token;
  if (typeof fromAuth === 'string' && fromAuth.length > 0) return fromAuth;

  const header = client.handshake.headers?.authorization;
  if (typeof header === 'string' && header.startsWith('Bearer ')) {
    return header.slice('Bearer '.length).trim();
  }

  const fromQuery = client.handshake.query?.token;
  if (typeof fromQuery === 'string' && fromQuery.length > 0) return fromQuery;

  return null;
}
