import { Inject, Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';
import { PulseEvent } from '../common/pulse-event';

const FEED_KEY = 'pulseboard:feed';

/**
 * Redis plays two roles here:
 *
 *  1. Pub/sub transport between the producer service and the backend. A
 *     subscriber connection cannot issue normal commands, so subscribers are
 *     created as separate connections via createSubscriber().
 *  2. A small cache of the most recent events, so a dashboard that connects
 *     mid-stream gets a populated feed immediately instead of an empty panel
 *     that fills in over the next minute.
 */
@Injectable()
export class RedisService implements OnModuleDestroy {
  private readonly logger = new Logger(RedisService.name);
  private readonly url: string;
  private readonly feedSize: number;
  private readonly client: Redis;
  private readonly subscribers: Redis[] = [];

  constructor(@Inject(ConfigService) config: ConfigService) {
    this.url = config.get<string>('app.redisUrl') as string;
    this.feedSize = config.get<number>('app.eventFeedSize') as number;
    this.client = new Redis(this.url, { maxRetriesPerRequest: null, lazyConnect: false });
    this.client.on('error', (error) => this.logger.error(`Redis error: ${error.message}`));
  }

  async onModuleDestroy(): Promise<void> {
    await Promise.all([...this.subscribers, this.client].map((client) => client.quit()));
  }

  /** A dedicated connection for SUBSCRIBE; tracked so it is closed on shutdown. */
  createSubscriber(): Redis {
    const subscriber = new Redis(this.url, { maxRetriesPerRequest: null });
    subscriber.on('error', (error) => this.logger.error(`Redis subscriber: ${error.message}`));
    this.subscribers.push(subscriber);
    return subscriber;
  }

  async publish(channel: string, payload: unknown): Promise<void> {
    await this.client.publish(channel, JSON.stringify(payload));
  }

  /** Push onto the capped recent-events list. */
  async cacheEvent(event: PulseEvent): Promise<void> {
    await this.client
      .multi()
      .lpush(FEED_KEY, JSON.stringify(event))
      .ltrim(FEED_KEY, 0, this.feedSize - 1)
      .exec();
  }

  async getCachedEvents(): Promise<PulseEvent[]> {
    const raw = await this.client.lrange(FEED_KEY, 0, this.feedSize - 1);
    return raw
      .map((entry) => {
        try {
          return JSON.parse(entry) as PulseEvent;
        } catch {
          return null;
        }
      })
      .filter((event): event is PulseEvent => event !== null);
  }

  async ping(): Promise<boolean> {
    try {
      return (await this.client.ping()) === 'PONG';
    } catch {
      return false;
    }
  }
}
