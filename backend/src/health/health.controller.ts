import { Controller, Get } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { DatabaseService } from '../database/database.service';
import { RedisService } from '../redis/redis.service';

@ApiTags('health')
@Controller('api/health')
export class HealthController {
  constructor(
    private readonly db: DatabaseService,
    private readonly redis: RedisService,
  ) {}

  @Get()
  @ApiOperation({
    summary: 'Liveness and dependency check',
    description: 'Used by docker compose, by ECS/App Service health probes and by CI.',
  })
  async check() {
    const [postgres, redis] = await Promise.all([
      this.db
        .query('SELECT 1')
        .then(() => true)
        .catch(() => false),
      this.redis.ping(),
    ]);

    return {
      status: postgres && redis ? 'ok' : 'degraded',
      postgres,
      redis,
      uptimeSeconds: Math.round(process.uptime()),
      timestamp: new Date().toISOString(),
    };
  }
}
