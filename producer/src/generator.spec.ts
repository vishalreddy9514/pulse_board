import { EventGenerator, nextDelayMs } from './generator';

/** A deterministic stand-in for Math.random that cycles a fixed sequence. */
function sequence(values: number[]): () => number {
  let index = 0;
  return () => values[index++ % values.length];
}

describe('EventGenerator', () => {
  it('produces a complete, well-typed event', () => {
    const event = new EventGenerator({ random: sequence([0.5]) }).next();

    expect(event.id).toMatch(/^[0-9a-f-]{36}$/);
    expect(['order', 'signup', 'refund', 'page_view']).toContain(event.type);
    expect(typeof event.amount).toBe('number');
    expect(event.userId).toMatch(/^user_\d{4}$/);
    expect(() => new Date(event.occurredAt).toISOString()).not.toThrow();
  });

  it('draws users from a fixed pool so active-user counts mean something', () => {
    const generator = new EventGenerator({ userPoolSize: 5, random: Math.random });
    const users = new Set(Array.from({ length: 200 }, () => generator.next().userId));

    expect(users.size).toBeLessThanOrEqual(5);
  });

  it('gives signups and page views no revenue', () => {
    const generator = new EventGenerator({ random: Math.random });
    const events = Array.from({ length: 300 }, () => generator.next());

    for (const event of events.filter((item) => item.type === 'signup' || item.type === 'page_view')) {
      expect(event.amount).toBe(0);
      expect(event.product).toBeNull();
    }
  });

  it('makes orders positive and refunds negative', () => {
    const generator = new EventGenerator({ random: Math.random });
    const events = Array.from({ length: 300 }, () => generator.next());

    expect(events.filter((event) => event.type === 'order').every((event) => event.amount > 0)).toBe(true);
    expect(events.filter((event) => event.type === 'refund').every((event) => event.amount < 0)).toBe(true);
  });

  it('rounds amounts to cents', () => {
    const generator = new EventGenerator({ random: Math.random });

    for (const event of Array.from({ length: 100 }, () => generator.next())) {
      expect(Math.round(event.amount * 100)).toBeCloseTo(event.amount * 100, 6);
    }
  });

  it('stamps the time it is given', () => {
    const at = new Date('2026-09-21T10:00:00.000Z');

    expect(new EventGenerator({ random: sequence([0.5]) }).next(at).occurredAt).toBe(
      at.toISOString(),
    );
  });
});

describe('nextDelayMs', () => {
  it('spaces events exponentially around the configured interval', () => {
    const delays = Array.from({ length: 2000 }, () => nextDelayMs(400, 1));
    const mean = delays.reduce((sum, value) => sum + value, 0) / delays.length;

    // Poisson arrivals: the mean gap is the interval, modulo burst windows
    // which pull it down a little.
    expect(mean).toBeGreaterThan(250);
    expect(mean).toBeLessThan(450);
  });

  it('never returns a delay that would spin the event loop', () => {
    const delays = Array.from({ length: 500 }, () => nextDelayMs(1, 10));

    expect(Math.min(...delays)).toBeGreaterThanOrEqual(5);
  });

  it('shortens the gap as the burst factor rises', () => {
    // No burst window (first draw >= 0.025), fixed second draw for the gap.
    const steady = nextDelayMs(400, 1, sequence([0.9, 0.5]));
    const busy = nextDelayMs(400, 4, sequence([0.9, 0.5]));

    expect(busy).toBeCloseTo(steady / 4, 5);
  });
});
