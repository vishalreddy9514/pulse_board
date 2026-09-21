import { randomUUID } from 'crypto';
import { PulseEvent, PulseEventType } from './types';

const REGIONS = ['us-east', 'us-west', 'eu-central', 'eu-west', 'ap-south', 'ap-northeast'];

const PRODUCTS = [
  { name: 'Starter Plan', price: 29 },
  { name: 'Pro Plan', price: 99 },
  { name: 'Team Plan', price: 249 },
  { name: 'Enterprise Plan', price: 1200 },
  { name: 'Analytics Add-on', price: 49 },
  { name: 'Support Package', price: 180 },
];

/** Relative frequency of each event type. Orders are the interesting ones. */
const TYPE_WEIGHTS: Array<[PulseEventType, number]> = [
  ['page_view', 55],
  ['order', 28],
  ['signup', 13],
  ['refund', 4],
];

export interface GeneratorOptions {
  /** Size of the recurring-customer pool; drives the active-user count. */
  userPoolSize?: number;
  random?: () => number;
}

/**
 * Produces plausible commerce traffic rather than uniform noise: a fixed pool
 * of recurring users so active-user counts behave, weighted event types, and
 * prices drawn from a real-looking catalogue. Injecting `random` keeps it
 * deterministic under test.
 */
export class EventGenerator {
  private readonly random: () => number;
  private readonly users: string[];

  constructor(options: GeneratorOptions = {}) {
    this.random = options.random ?? Math.random;
    const poolSize = options.userPoolSize ?? 400;
    this.users = Array.from({ length: poolSize }, (_, index) =>
      `user_${String(index).padStart(4, '0')}`,
    );
  }

  next(now = new Date()): PulseEvent {
    const type = this.pickType();
    const product = type === 'page_view' || type === 'signup' ? null : this.pickProduct();
    const amount = this.amountFor(type, product?.price ?? 0);

    return {
      id: randomUUID(),
      type,
      amount: Math.round(amount * 100) / 100,
      userId: this.users[Math.floor(this.random() * this.users.length)],
      region: REGIONS[Math.floor(this.random() * REGIONS.length)],
      product: product?.name ?? null,
      occurredAt: now.toISOString(),
    };
  }

  private pickType(): PulseEventType {
    const total = TYPE_WEIGHTS.reduce((sum, [, weight]) => sum + weight, 0);
    let roll = this.random() * total;
    for (const [type, weight] of TYPE_WEIGHTS) {
      roll -= weight;
      if (roll <= 0) return type;
    }
    return 'page_view';
  }

  private pickProduct(): { name: string; price: number } {
    return PRODUCTS[Math.floor(this.random() * PRODUCTS.length)];
  }

  private amountFor(type: PulseEventType, price: number): number {
    if (type === 'order') {
      // Orders carry one to three seats, with a little jitter on the price.
      const seats = 1 + Math.floor(this.random() * 3);
      return price * seats * (0.9 + this.random() * 0.2);
    }
    if (type === 'refund') return -price;
    return 0;
  }
}

/**
 * Traffic is not uniform, and a dashboard that only ever shows a flat line
 * proves nothing. Roughly one interval in forty opens a short burst window,
 * which is what makes the threshold alerts fire on their own during a demo.
 */
export function nextDelayMs(
  baseIntervalMs: number,
  burstFactor: number,
  random: () => number = Math.random,
): number {
  const inBurst = random() < 0.025;
  const effectiveInterval = baseIntervalMs / (burstFactor * (inBurst ? 8 : 1));
  // Exponential spacing: events arrive as a Poisson process, like real traffic.
  return Math.max(5, -Math.log(1 - random()) * effectiveInterval);
}
