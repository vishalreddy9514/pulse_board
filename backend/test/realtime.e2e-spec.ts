import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import Redis from 'ioredis';
import { randomUUID } from 'crypto';
import { AddressInfo } from 'net';
import { io, Socket } from 'socket.io-client';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { DatabaseService } from '../src/database/database.service';
import { PulseEvent } from '../src/common/pulse-event';

/**
 * End-to-end proof of the streaming path against real infrastructure: an event
 * published to Redis by an outside client must reach an authenticated browser
 * socket and be persisted to Postgres. Nothing here is mocked — this is the
 * test that would catch a broken subscription, a broken handshake or a
 * serialisation change.
 *
 * Requires Postgres and Redis (docker compose up postgres redis, or the
 * service containers the CI workflow starts).
 */
describe('Realtime pipeline (integration)', () => {
  jest.setTimeout(30_000);

  const channel = process.env.REDIS_EVENT_CHANNEL ?? 'pulseboard:events';
  const email = `e2e-${randomUUID()}@pulseboard.dev`;
  const password = 'integration-test-password';

  let app: INestApplication;
  let url: string;
  let token: string;
  let publisher: Redis;
  let db: DatabaseService;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();

    app = moduleRef.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    await app.init();
    await app.listen(0);

    const { port } = app.getHttpServer().address() as AddressInfo;
    url = `http://127.0.0.1:${port}`;
    db = app.get(DatabaseService);
    publisher = new Redis(process.env.REDIS_URL ?? 'redis://localhost:6379');

    const response = await request(app.getHttpServer())
      .post('/api/auth/register')
      .send({ email, password })
      .expect(201);
    token = response.body.accessToken;
  });

  afterAll(async () => {
    await publisher?.quit();
    await app?.close();
  });

  function connect(auth?: Record<string, string>): Socket {
    return io(url, { transports: ['websocket'], auth, forceNew: true });
  }

  it('rejects a socket that presents no token', async () => {
    const socket = connect();

    const outcome = await settleWithin(socket, 8000);
    socket.close();

    expect(outcome).toBe('rejected');
  });

  it('rejects a socket that presents a forged token', async () => {
    const socket = connect({ token: 'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJoYXgifQ.not-a-signature' });

    const outcome = await settleWithin(socket, 8000);
    socket.close();

    expect(outcome).toBe('rejected');
  });

  it('delivers a Redis-published event to an authenticated socket and stores it', async () => {
    const socket = connect({ token });

    const snapshot = await once(socket, 'snapshot');
    expect(snapshot).toHaveProperty('metrics');
    expect(snapshot).toHaveProperty('events');

    const published: PulseEvent = {
      id: randomUUID(),
      type: 'order',
      amount: 123.45,
      userId: 'e2e-user',
      region: 'us-east',
      product: 'Integration Plan',
      occurredAt: new Date().toISOString(),
    };

    const delivered = new Promise<PulseEvent>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('event never arrived on the socket')), 10_000);
      socket.on('event:new', (event: PulseEvent) => {
        if (event.id !== published.id) return;
        clearTimeout(timer);
        resolve(event);
      });
    });

    await publisher.publish(channel, JSON.stringify(published));
    const received = await delivered;
    expect(received).toEqual(published);

    // The insert is batched, so give the flush interval a moment to land.
    const rows = await eventually(() =>
      db.query<{ id: string; amount: string }>('SELECT id, amount FROM events WHERE id = $1', [
        published.id,
      ]),
    );
    expect(rows).toHaveLength(1);
    expect(Number(rows[0].amount)).toBe(123.45);

    socket.close();
  });

  it('pushes aggregate metrics on a tick without the client asking', async () => {
    const socket = connect({ token });
    await once(socket, 'snapshot');

    const update = await once<{ metrics: { timestamp: string }; point: unknown }>(
      socket,
      'metrics:update',
      6000,
    );
    socket.close();

    expect(update.metrics).toHaveProperty('revenueLast60s');
    expect(update).toHaveProperty('point');
  });

  it('refuses a historical query without a bearer token', async () => {
    await request(app.getHttpServer()).get('/api/history/summary').expect(401);
  });

  it('serves historical data to an authenticated caller', async () => {
    const to = new Date();
    const from = new Date(to.getTime() - 60 * 60 * 1000);

    const response = await request(app.getHttpServer())
      .get('/api/history/series')
      .query({ from: from.toISOString(), to: to.toISOString(), bucketSeconds: 60 })
      .set('authorization', `Bearer ${token}`)
      .expect(200);

    expect(Array.isArray(response.body)).toBe(true);
  });
});

/**
 * Resolves with what the server did with an unauthenticated handshake. The
 * fallback timer is cleared on settle so it does not outlive the test and keep
 * the process alive.
 */
function settleWithin(socket: Socket, timeoutMs: number): Promise<string> {
  return new Promise<string>((resolve) => {
    const timer = setTimeout(() => resolve('no response'), timeoutMs);
    const settle = (outcome: string) => {
      clearTimeout(timer);
      resolve(outcome);
    };
    socket.on('auth:error', () => settle('rejected'));
    socket.on('snapshot', () => settle('leaked a snapshot'));
  });
}

function once<T>(socket: Socket, event: string, timeoutMs = 10_000): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`timed out waiting for "${event}"`)), timeoutMs);
    socket.once(event, (payload: T) => {
      clearTimeout(timer);
      resolve(payload);
    });
  });
}

/** Retries a query until it returns rows, for assertions that race a flush. */
async function eventually<T>(query: () => Promise<T[]>, attempts = 20, delayMs = 250): Promise<T[]> {
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    const rows = await query();
    if (rows.length > 0) return rows;
    await new Promise((resolve) => setTimeout(resolve, delayMs));
  }
  return [];
}
