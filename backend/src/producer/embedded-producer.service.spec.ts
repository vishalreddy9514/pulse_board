import { ConfigService } from '@nestjs/config';
import { EmbeddedProducerService } from './embedded-producer.service';
import { RedisService } from '../redis/redis.service';
import { PulseEvent } from '../common/pulse-event';

function configFor(values: Record<string, unknown>): ConfigService {
  return { get: (key: string) => values[key] } as unknown as ConfigService;
}

describe('EmbeddedProducerService', () => {
  const baseConfig = {
    'app.producerIntervalMs': 10,
    'app.producerBurstFactor': 1,
    'app.redisEventChannel': 'pulseboard:events',
  };

  afterEach(() => jest.useRealTimers());

  it('publishes nothing when it is switched off', async () => {
    const publish = jest.fn();
    const service = new EmbeddedProducerService(
      configFor({ ...baseConfig, 'app.embeddedProducer': false }),
      { publish } as unknown as RedisService,
    );

    service.onModuleInit();
    await new Promise((resolve) => setTimeout(resolve, 50));
    service.onModuleDestroy();

    expect(publish).not.toHaveBeenCalled();
  });

  it('publishes well-formed events to the configured channel when switched on', async () => {
    const published: Array<[string, PulseEvent]> = [];
    const publish = jest.fn(async (channel: string, event: PulseEvent) => {
      published.push([channel, event]);
    });
    const service = new EmbeddedProducerService(
      configFor({ ...baseConfig, 'app.embeddedProducer': true }),
      { publish } as unknown as RedisService,
    );

    service.onModuleInit();
    await new Promise((resolve) => setTimeout(resolve, 120));
    service.onModuleDestroy();

    expect(published.length).toBeGreaterThan(0);
    const [channel, event] = published[0];
    expect(channel).toBe('pulseboard:events');
    expect(event.id).toMatch(/^[0-9a-f-]{36}$/);
    expect(['order', 'signup', 'refund', 'page_view']).toContain(event.type);
  });

  it('keeps going when Redis rejects a publish', async () => {
    const publish = jest
      .fn()
      .mockRejectedValueOnce(new Error('connection lost'))
      .mockResolvedValue(undefined);
    const service = new EmbeddedProducerService(
      configFor({ ...baseConfig, 'app.embeddedProducer': true }),
      { publish } as unknown as RedisService,
    );

    service.onModuleInit();
    await new Promise((resolve) => setTimeout(resolve, 120));
    service.onModuleDestroy();

    expect(publish.mock.calls.length).toBeGreaterThan(1);
    expect(service.publishedCount).toBeGreaterThan(0);
  });

  it('stops publishing after shutdown', async () => {
    const publish = jest.fn().mockResolvedValue(undefined);
    const service = new EmbeddedProducerService(
      configFor({ ...baseConfig, 'app.embeddedProducer': true }),
      { publish } as unknown as RedisService,
    );

    service.onModuleInit();
    await new Promise((resolve) => setTimeout(resolve, 60));
    service.onModuleDestroy();
    const afterShutdown = publish.mock.calls.length;

    await new Promise((resolve) => setTimeout(resolve, 80));
    expect(publish.mock.calls.length).toBe(afterShutdown);
  });
});
