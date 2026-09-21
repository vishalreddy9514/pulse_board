import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsIn, IsInt, IsISO8601, IsOptional, Max, Min } from 'class-validator';
import { PulseEventType } from '../../common/pulse-event';

const EVENT_TYPES: PulseEventType[] = ['order', 'signup', 'refund', 'page_view'];

export class HistoryRangeDto {
  @ApiPropertyOptional({
    description: 'Start of the range (ISO 8601). Defaults to 24 hours ago.',
    example: '2026-09-20T00:00:00.000Z',
  })
  @IsOptional()
  @IsISO8601()
  from?: string;

  @ApiPropertyOptional({
    description: 'End of the range (ISO 8601). Defaults to now.',
    example: '2026-09-21T00:00:00.000Z',
  })
  @IsOptional()
  @IsISO8601()
  to?: string;
}

export class HistorySeriesQueryDto extends HistoryRangeDto {
  @ApiPropertyOptional({
    description: 'Bucket width in seconds.',
    default: 300,
    minimum: 1,
    maximum: 86400,
  })
  @IsOptional()
  @Transform(({ value }) => Number(value))
  @IsInt()
  @Min(1)
  @Max(86_400)
  bucketSeconds?: number;
}

export class HistoryEventsQueryDto extends HistoryRangeDto {
  @ApiPropertyOptional({ enum: EVENT_TYPES, description: 'Filter to a single event type.' })
  @IsOptional()
  @IsIn(EVENT_TYPES)
  type?: PulseEventType;

  @ApiPropertyOptional({ default: 50, minimum: 1, maximum: 500 })
  @IsOptional()
  @Transform(({ value }) => Number(value))
  @IsInt()
  @Min(1)
  @Max(500)
  limit?: number;

  @ApiPropertyOptional({ default: 0, minimum: 0 })
  @IsOptional()
  @Transform(({ value }) => Number(value))
  @IsInt()
  @Min(0)
  offset?: number;
}
