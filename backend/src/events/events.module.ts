import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { MetricsModule } from '../metrics/metrics.module';
import { EventStream } from './event-stream';
import { EventsController } from './events.controller';
import { EventsRepository } from './events.repository';
import { EventsService } from './events.service';
import { IngestService } from './ingest.service';

@Module({
  imports: [AuthModule, MetricsModule],
  controllers: [EventsController],
  providers: [EventsRepository, EventsService, IngestService, EventStream],
  exports: [EventsService, EventStream, EventsRepository],
})
export class EventsModule {}
