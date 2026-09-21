/**
 * Mirrors backend/src/common/pulse-event.ts. The two services are deployed
 * independently, so the contract is duplicated deliberately rather than shared
 * through a build-time import: the producer can be replaced by a real event
 * source without the backend depending on it.
 */
export type PulseEventType = 'order' | 'signup' | 'refund' | 'page_view';

export interface PulseEvent {
  id: string;
  type: PulseEventType;
  amount: number;
  userId: string;
  region: string;
  product: string | null;
  occurredAt: string;
}
