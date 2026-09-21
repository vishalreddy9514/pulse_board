import { PulseEvent, PulseEventType } from '../common/pulse-event';

const VALID_TYPES: PulseEventType[] = ['order', 'signup', 'refund', 'page_view'];

/**
 * Anything arriving over pub/sub is untrusted input: another producer, a stale
 * deploy or a hand-run redis-cli can put a malformed payload on the channel.
 * Returning null (rather than throwing) lets the consumer drop a bad message
 * and keep the subscription alive.
 */
export function parsePulseEvent(raw: string): PulseEvent | null {
  let candidate: unknown;
  try {
    candidate = JSON.parse(raw);
  } catch {
    return null;
  }

  if (typeof candidate !== 'object' || candidate === null) return null;
  const value = candidate as Record<string, unknown>;

  if (typeof value.id !== 'string' || value.id.length === 0) return null;
  if (typeof value.type !== 'string' || !VALID_TYPES.includes(value.type as PulseEventType)) {
    return null;
  }
  if (typeof value.userId !== 'string' || value.userId.length === 0) return null;
  if (typeof value.region !== 'string') return null;
  if (typeof value.occurredAt !== 'string' || Number.isNaN(Date.parse(value.occurredAt))) {
    return null;
  }

  const amount = typeof value.amount === 'number' ? value.amount : Number(value.amount);
  if (!Number.isFinite(amount)) return null;

  return {
    id: value.id,
    type: value.type as PulseEventType,
    amount,
    userId: value.userId,
    region: value.region,
    product: typeof value.product === 'string' ? value.product : null,
    occurredAt: new Date(value.occurredAt).toISOString(),
  };
}
