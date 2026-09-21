/**
 * Single place where process.env is read. Everything else in the app takes its
 * configuration from here, which keeps the services testable (you can hand them
 * a plain object) and makes the deployable surface of the app easy to document.
 */
export interface AppConfig {
  nodeEnv: string;
  port: number;
  corsOrigins: string[];
  databaseUrl: string;
  redisUrl: string;
  redisEventChannel: string;
  eventFeedSize: number;
  jwtSecret: string;
  jwtExpiresIn: string;
  seedUserEmail?: string;
  seedUserPassword?: string;
  alerts: {
    revenueSpike: number;
    revenueDrop: number;
    ordersSurge: number;
  };
}

function num(value: string | undefined, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export default (): { app: AppConfig } => ({
  app: {
    nodeEnv: process.env.NODE_ENV ?? 'development',
    port: num(process.env.PORT, 4000),
    corsOrigins: (process.env.CORS_ORIGIN ?? 'http://localhost:5173')
      .split(',')
      .map((origin) => origin.trim())
      .filter(Boolean),
    databaseUrl:
      process.env.DATABASE_URL ?? 'postgres://pulseboard:pulseboard@localhost:5432/pulseboard',
    redisUrl: process.env.REDIS_URL ?? 'redis://localhost:6379',
    redisEventChannel: process.env.REDIS_EVENT_CHANNEL ?? 'pulseboard:events',
    eventFeedSize: num(process.env.EVENT_FEED_SIZE, 50),
    jwtSecret: process.env.JWT_SECRET ?? 'dev-only-change-me-to-a-long-random-string',
    jwtExpiresIn: process.env.JWT_EXPIRES_IN ?? '12h',
    seedUserEmail: process.env.SEED_USER_EMAIL,
    seedUserPassword: process.env.SEED_USER_PASSWORD,
    alerts: {
      revenueSpike: num(process.env.ALERT_REVENUE_SPIKE, 20_000),
      revenueDrop: num(process.env.ALERT_REVENUE_DROP, 2_000),
      ordersSurge: num(process.env.ALERT_ORDERS_SURGE, 40),
    },
  },
});
