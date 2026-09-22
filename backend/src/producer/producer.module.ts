import { Module } from '@nestjs/common';
import { EmbeddedProducerService } from './embedded-producer.service';

@Module({
  providers: [EmbeddedProducerService],
  exports: [EmbeddedProducerService],
})
export class EmbeddedProducerModule {}
