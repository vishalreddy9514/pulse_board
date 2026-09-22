import { Inject, Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { RedisService } from '../redis/redis.service';
import { EventGenerator, nextDelayMs } from './generator';

/**
 * Runs the event generator inside the API process, publishing to the same Redis
 * channel the standalone producer uses. Off by default: locally and in any real
 * deployment the producer is its own service, which is the point of the
 * architecture. It exists for hosts that give you exactly one always-on process
 * on the free plan, where a second container is not an option.
 *
 * Because it publishes to Redis rather than shortcutting into the event stream,
 * the ingest path, the persistence path and the fan-out are all exercised
 * exactly as they would be with the separate service.
 */
@Injectable()
export class EmbeddedProducerService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(EmbeddedProducerService.name);
  private readonly generator = new EventGenerator();
  private timer?: NodeJS.Timeout;
  private running = false;
  private published = 0;

  constructor(
    @Inject(ConfigService) private readonly config: ConfigService,
    private readonly redis: RedisService,
  ) {}

  onModuleInit(): void {
    if (!this.config.get<boolean>('app.embeddedProducer')) return;

    this.running = true;
    const intervalMs = this.config.get<number>('app.producerIntervalMs') as number;
    this.logger.log(`Embedded producer on, mean interval ${intervalMs}ms`);
    this.scheduleNext();
  }

  onModuleDestroy(): void {
    this.running = false;
    if (this.timer) clearTimeout(this.timer);
  }

  get publishedCount(): number {
    return this.published;
  }

  private scheduleNext(): void {
    if (!this.running) return;

    const intervalMs = this.config.get<number>('app.producerIntervalMs') as number;
    const burstFactor = this.config.get<number>('app.producerBurstFactor') as number;

    this.timer = setTimeout(() => void this.tick(), nextDelayMs(intervalMs, burstFactor));
  }

  private async tick(): Promise<void> {
    if (!this.running) return;

    try {
      await this.redis.publish(
        this.config.get<string>('app.redisEventChannel') as string,
        this.generator.next(),
      );
      this.published += 1;
    } catch (error) {
      // A Redis blip should slow the generator, not kill the API process.
      this.logger.warn(`Embedded producer publish failed: ${(error as Error).message}`);
    }

    this.scheduleNext();
  }
}
