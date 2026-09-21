import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PulseEvent } from '../common/pulse-event';
import { HistoryEventsQueryDto, HistorySeriesQueryDto, HistoryRangeDto } from './dto/history-query.dto';
import { HistoryBucket, HistorySummary } from './events.repository';
import { EventsService } from './events.service';

@ApiTags('history')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('api/history')
export class EventsController {
  constructor(private readonly events: EventsService) {}

  @Get('series')
  @ApiOperation({
    summary: 'Time-bucketed metrics from Postgres',
    description:
      'Aggregates persisted events into fixed-width buckets. This is the stored-data counterpart of the live socket stream.',
  })
  series(@Query() query: HistorySeriesQueryDto): Promise<HistoryBucket[]> {
    return this.events.series(query);
  }

  @Get('summary')
  @ApiOperation({ summary: 'Totals for a time range' })
  summary(@Query() query: HistoryRangeDto): Promise<HistorySummary> {
    return this.events.summary(query);
  }

  @Get('events')
  @ApiOperation({ summary: 'Raw events for a time range, newest first' })
  list(@Query() query: HistoryEventsQueryDto): Promise<PulseEvent[]> {
    return this.events.list(query);
  }
}
