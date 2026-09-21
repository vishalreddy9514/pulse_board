import { BadRequestException, Injectable } from '@nestjs/common';
import { PulseEvent } from '../common/pulse-event';
import { HistoryEventsQueryDto, HistorySeriesQueryDto, HistoryRangeDto } from './dto/history-query.dto';
import { EventsRepository, HistoryBucket, HistorySummary } from './events.repository';

const DEFAULT_LOOKBACK_MS = 24 * 60 * 60 * 1000;
const DEFAULT_BUCKET_SECONDS = 300;
const MAX_BUCKETS = 1500;

/**
 * Read side of the events table: everything the historical view asks for.
 * The live path never comes through here — it is served from memory and Redis.
 */
@Injectable()
export class EventsService {
  constructor(private readonly repository: EventsRepository) {}

  async series(query: HistorySeriesQueryDto): Promise<HistoryBucket[]> {
    const range = resolveRange(query);
    const bucketSeconds = query.bucketSeconds ?? DEFAULT_BUCKET_SECONDS;

    // Guard against a request like "a year at one-second buckets", which would
    // ask Postgres to build tens of millions of rows and then ship them.
    const buckets = (range.to.getTime() - range.from.getTime()) / 1000 / bucketSeconds;
    if (buckets > MAX_BUCKETS) {
      throw new BadRequestException(
        `That range needs ${Math.round(buckets)} buckets; widen bucketSeconds or shorten the range (max ${MAX_BUCKETS}).`,
      );
    }

    return this.repository.series(range, bucketSeconds);
  }

  // async so that a bad range rejects rather than throwing synchronously; the
  // two are equivalent to Nest, but not to a caller holding the promise.
  async summary(query: HistoryRangeDto): Promise<HistorySummary> {
    return this.repository.summary(resolveRange(query));
  }

  async list(query: HistoryEventsQueryDto): Promise<PulseEvent[]> {
    return this.repository.list({
      ...resolveRange(query),
      type: query.type,
      limit: query.limit ?? 50,
      offset: query.offset ?? 0,
    });
  }

  /** Seeds a newly connected dashboard's charts with recent history. */
  async recentSeries(windowMs: number, bucketSeconds: number): Promise<HistoryBucket[]> {
    const to = new Date();
    const from = new Date(to.getTime() - windowMs);
    return this.repository.series({ from, to }, bucketSeconds);
  }
}

function resolveRange(query: HistoryRangeDto): { from: Date; to: Date } {
  const to = query.to ? new Date(query.to) : new Date();
  const from = query.from ? new Date(query.from) : new Date(to.getTime() - DEFAULT_LOOKBACK_MS);

  if (from.getTime() >= to.getTime()) {
    throw new BadRequestException('"from" must be earlier than "to"');
  }
  return { from, to };
}
