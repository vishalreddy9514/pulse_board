import { Inject, Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Pool, QueryResultRow } from 'pg';
import { SCHEMA_SQL } from './schema';

/**
 * Thin wrapper around a pg connection pool. Owning the pool in one injectable
 * keeps connection handling (and the retry-until-Postgres-is-up dance that
 * docker compose makes necessary) out of the feature services.
 */
@Injectable()
export class DatabaseService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(DatabaseService.name);
  private readonly pool: Pool;

  constructor(@Inject(ConfigService) config: ConfigService) {
    this.pool = new Pool({
      connectionString: config.get<string>('app.databaseUrl'),
      max: 10,
      idleTimeoutMillis: 30_000,
    });
  }

  async onModuleInit(): Promise<void> {
    await this.waitForConnection();
    await this.pool.query(SCHEMA_SQL);
    this.logger.log('Postgres ready, schema applied');
  }

  async onModuleDestroy(): Promise<void> {
    await this.pool.end();
  }

  async query<T extends QueryResultRow = QueryResultRow>(
    text: string,
    params: unknown[] = [],
  ): Promise<T[]> {
    const result = await this.pool.query<T>(text, params);
    return result.rows;
  }

  /**
   * Postgres inside compose accepts TCP connections before it is ready to serve
   * queries, so we retry with a short backoff instead of crashing the container.
   */
  private async waitForConnection(attempts = 15, delayMs = 1000): Promise<void> {
    for (let attempt = 1; attempt <= attempts; attempt += 1) {
      try {
        await this.pool.query('SELECT 1');
        return;
      } catch (error) {
        if (attempt === attempts) throw error;
        this.logger.warn(`Postgres not ready (attempt ${attempt}/${attempts}), retrying...`);
        await new Promise((resolve) => setTimeout(resolve, delayMs));
      }
    }
  }
}
