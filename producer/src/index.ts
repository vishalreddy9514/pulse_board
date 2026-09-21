import Redis from 'ioredis';
import { EventGenerator, nextDelayMs } from './generator';

const REDIS_URL = process.env.REDIS_URL ?? 'redis://localhost:6379';
const CHANNEL = process.env.REDIS_EVENT_CHANNEL ?? 'pulseboard:events';
const INTERVAL_MS = Number(process.env.PRODUCER_INTERVAL_MS ?? 450);
const BURST_FACTOR = Number(process.env.PRODUCER_BURST_FACTOR ?? 1);
/** Log a one-line heartbeat this often, so the container is not silent. */
const REPORT_EVERY = 100;

async function main(): Promise<void> {
  const redis = new Redis(REDIS_URL, { maxRetriesPerRequest: null });
  const generator = new EventGenerator();

  redis.on('error', (error) => console.error(`[producer] redis: ${error.message}`));
  redis.on('ready', () => console.log(`[producer] connected, publishing to "${CHANNEL}"`));

  let published = 0;
  let running = true;

  const shutdown = async (signal: string) => {
    console.log(`[producer] ${signal} received, stopping after ${published} events`);
    running = false;
    await redis.quit();
    process.exit(0);
  };
  process.on('SIGINT', () => void shutdown('SIGINT'));
  process.on('SIGTERM', () => void shutdown('SIGTERM'));

  while (running) {
    const event = generator.next();
    try {
      await redis.publish(CHANNEL, JSON.stringify(event));
      published += 1;
      if (published % REPORT_EVERY === 0) {
        console.log(`[producer] published ${published} events`);
      }
    } catch (error) {
      // ioredis reconnects on its own; keep generating rather than exiting so a
      // Redis restart does not take the producer down with it.
      console.error(`[producer] publish failed: ${(error as Error).message}`);
    }
    await sleep(nextDelayMs(INTERVAL_MS, BURST_FACTOR));
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

void main();
