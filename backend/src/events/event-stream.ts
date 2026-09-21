import { Injectable } from '@nestjs/common';
import { Subject } from 'rxjs';
import { PulseEvent } from '../common/pulse-event';

/**
 * Decouples the Redis consumer from the WebSocket gateway. The ingest service
 * only knows "an event arrived"; the gateway only knows "here is a stream of
 * events to fan out". Neither imports the other, which keeps the module graph
 * acyclic and makes both sides trivial to test in isolation.
 */
@Injectable()
export class EventStream {
  private readonly subject = new Subject<PulseEvent>();
  readonly events$ = this.subject.asObservable();

  publish(event: PulseEvent): void {
    this.subject.next(event);
  }
}
