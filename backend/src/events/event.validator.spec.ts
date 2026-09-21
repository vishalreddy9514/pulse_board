import { parsePulseEvent } from './event.validator';

const valid = {
  id: 'ec06f0f0-2a0a-4d95-a0ec-8d1a1a1f0001',
  type: 'order',
  amount: 99.5,
  userId: 'user_0042',
  region: 'eu-west',
  product: 'Pro Plan',
  occurredAt: '2026-09-21T12:00:00.000Z',
};

describe('parsePulseEvent', () => {
  it('accepts a well-formed event', () => {
    expect(parsePulseEvent(JSON.stringify(valid))).toEqual(valid);
  });

  it('coerces a numeric string amount', () => {
    const parsed = parsePulseEvent(JSON.stringify({ ...valid, amount: '12.25' }));
    expect(parsed?.amount).toBe(12.25);
  });

  it('normalises a missing product to null', () => {
    const parsed = parsePulseEvent(JSON.stringify({ ...valid, product: undefined }));
    expect(parsed?.product).toBeNull();
  });

  it.each([
    ['invalid JSON', 'not json at all'],
    ['a JSON scalar', '"just a string"'],
    ['an unknown type', JSON.stringify({ ...valid, type: 'chargeback' })],
    ['a missing id', JSON.stringify({ ...valid, id: '' })],
    ['a missing user', JSON.stringify({ ...valid, userId: undefined })],
    ['an unparseable timestamp', JSON.stringify({ ...valid, occurredAt: 'yesterday' })],
    ['a non-numeric amount', JSON.stringify({ ...valid, amount: 'free' })],
  ])('rejects %s', (_label, payload) => {
    expect(parsePulseEvent(payload)).toBeNull();
  });
});
