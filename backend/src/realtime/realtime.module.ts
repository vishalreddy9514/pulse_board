import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { EventsModule } from '../events/events.module';
import { MetricsModule } from '../metrics/metrics.module';
import { RealtimeGateway } from './realtime.gateway';

@Module({
  imports: [AuthModule, EventsModule, MetricsModule],
  providers: [RealtimeGateway],
})
export class RealtimeModule {}
