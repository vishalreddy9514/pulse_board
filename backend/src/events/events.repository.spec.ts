import { DatabaseService } from '../database/database.service';
import { EventsRepository } from './events.repository';
import { PulseEvent } from '../common/pulse-event';

function event(id: string, overrides: Partial<PulseEvent> = {}): PulseEvent {
  return {
    id,
    type: 'order',
    amount: 10,
    userId: 'user_1',
    region: 'us-east',
    product: 'Pro Plan',
    occurredAt: '2026-09-21T12:00:00.000Z',
    ...overrides,
  };
}

describe('EventsRepository.insertMany', () => {
  let db: { query: jest.Mock };
  let repository: EventsRepository;

  beforeEach(() => {
    db = { query: jest.fn().mockResolvedValue([]) };
    repository = new EventsRepository(db as unknown as DatabaseService);
  });

  it('does not touch the database for an empty batch', async () => {
    await repository.insertMany([]);
    expect(db.query).not.toHaveBeenCalled();
  });

  it('numbers placeholders so every row lines up with its own values', async () => {
    await repository.insertMany([event('id-1'), event('id-2'), event('id-3')]);

    const [sql, values] = db.query.mock.calls[0];

    // Seven columns per row, so the third row starts at $15.
    expect(sql).toContain('($1, $2, $3, $4, $5, $6, $7)');
    expect(sql).toContain('($8, $9, $10, $11, $12, $13, $14)');
    expect(sql).toContain('($15, $16, $17, $18, $19, $20, $21)');
    expect(values).toHaveLength(21);

    // The id of each row must land on the placeholder that row's id claims.
    expect(values[0]).toBe('id-1');
    expect(values[7]).toBe('id-2');
    expect(values[14]).toBe('id-3');
    expect(values[6]).toBe('2026-09-21T12:00:00.000Z');
  });

  it('is idempotent on redelivery of the same event id', async () => {
    await repository.insertMany([event('id-1')]);
    expect(db.query.mock.calls[0][0]).toContain('ON CONFLICT (id) DO NOTHING');
  });
});
