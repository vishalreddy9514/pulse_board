import { Inject, Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type Redis from 'ioredis';
import { PulseEvent } from '../common/pulse-event';
import { MetricsService } from '../metrics/metrics.service';
import { RedisService } from '../redis/redis.service';
import { EventStream } from './event-stream';
import { EventsRepository } from './events.repository';
import { parsePulseEvent } from './event.validator';

const FLUSH_INTERVAL_MS = 250;
const MAX_BATCH = 200;

/**
 * Consumes the Redis event channel and is the only writer to the events table.
 *
 * Ordering here is deliberate: an arriving event updates the in-memory metrics
 * and is fanned out to dashboards immediately, then queued for persistence.
 * A live dashboard should never wait on a database round trip, and the insert
 * is batched (every 250ms, or 200 events, whichever comes first) so a busy
 * stream costs one write per batch instead of one per event.
 */
@Injectable()
export class IngestService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(IngestService.name);
  private readonly channel: string;
  private subscriber?: Redis;
  private pending: PulseEvent[] = [];
  private flushTimer?: NodeJS.Timeout;
  private droppedMessages = 0;

  constructor(
    @Inject(ConfigService) config: ConfigService,
    private readonly redis: RedisService,
    private readonly repository: EventsRepository,
    private readonly metrics: MetricsService,
    private readonly stream: EventStream,
  ) {
    this.channel = config.get<string>('app.redisEventChannel') as string;
  }

  async onModuleInit(): Promise<void> {
    const totals = await this.repository.lifetimeTotals();
    this.metrics.primeTotals(totals.totalRevenue, totals.totalOrders);

    this.subscriber = this.redis.createSubscriber();
    await this.subscriber.subscribe(this.channel);
    this.subscriber.on('message', (_channel, message) => void this.handleMessage(message));
    this.flushTimer = setInterval(() => void this.flush(), FLUSH_INTERVAL_MS);
    this.logger.log(`Subscribed to "${this.channel}"`);
  }

  async onModuleDestroy(): Promise<void> {
    if (this.flushTimer) clearInterval(this.flushTimer);
    await this.flush();
  }

  get droppedMessageCount(): number {
    return this.droppedMessages;
  }

  private async handleMessage(message: string): Promise<void> {
    const event = parsePulseEvent(message);
    if (!event) {
      this.droppedMessages += 1;
      this.logger.warn(`Dropped malformed event (${this.droppedMessages} total)`);
      return;
    }

    this.metrics.record(event);
    this.stream.publish(event);
    this.pending.push(event);

    await this.redis.cacheEvent(event).catch((error) => {
      this.logger.warn(`Could not cache event: ${(error as Error).message}`);
    });

    if (this.pending.length >= MAX_BATCH) await this.flush();
  }

  private async flush(): Promise<void> {
    if (this.pending.length === 0) return;
    const batch = this.pending;
    this.pending = [];

    try {
      await this.repository.insertMany(batch);
    } catch (error) {
      // Losing a batch degrades history, not the live view. Log loudly and keep
      // consuming rather than letting the subscription die.
      this.logger.error(`Failed to persist ${batch.length} events: ${(error as Error).message}`);
    }
  }
}
