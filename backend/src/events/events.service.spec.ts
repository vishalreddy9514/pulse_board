import { BadRequestException } from '@nestjs/common';
import { EventsRepository } from './events.repository';
import { EventsService } from './events.service';

describe('EventsService', () => {
  let repository: jest.Mocked<Pick<EventsRepository, 'series' | 'summary' | 'list'>>;
  let service: EventsService;

  beforeEach(() => {
    repository = {
      series: jest.fn().mockResolvedValue([]),
      summary: jest.fn().mockResolvedValue({}),
      list: jest.fn().mockResolvedValue([]),
    };
    service = new EventsService(repository as unknown as EventsRepository);
  });

  it('defaults to the last 24 hours in five-minute buckets', async () => {
    await service.series({});

    const [range, bucketSeconds] = repository.series.mock.calls[0];
    expect(bucketSeconds).toBe(300);
    expect(range.to.getTime() - range.from.getTime()).toBe(24 * 60 * 60 * 1000);
  });

  it('passes an explicit range straight through', async () => {
    await service.series({
      from: '2026-09-01T00:00:00.000Z',
      to: '2026-09-02T00:00:00.000Z',
      bucketSeconds: 3600,
    });

    const [range, bucketSeconds] = repository.series.mock.calls[0];
    expect(range.from.toISOString()).toBe('2026-09-01T00:00:00.000Z');
    expect(bucketSeconds).toBe(3600);
  });

  it('refuses a range that would produce an unbounded number of buckets', async () => {
    await expect(
      service.series({
        from: '2026-01-01T00:00:00.000Z',
        to: '2026-09-01T00:00:00.000Z',
        bucketSeconds: 1,
      }),
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(repository.series).not.toHaveBeenCalled();
  });

  it('refuses a backwards range', async () => {
    await expect(
      service.summary({ from: '2026-09-02T00:00:00.000Z', to: '2026-09-01T00:00:00.000Z' }),
    ).rejects.toThrow('"from" must be earlier than "to"');
  });

  it('applies paging defaults when listing events', async () => {
    await service.list({});

    expect(repository.list).toHaveBeenCalledWith(
      expect.objectContaining({ limit: 50, offset: 0, type: undefined }),
    );
  });
});
