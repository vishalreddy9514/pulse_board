# Deploying PulseBoard

The three services are ordinary containers with no local state, so anything
that runs containers will do.

**Free, no credit card:** Render for the API and the dashboard, Neon for
Postgres, Redis Cloud for Redis — see [`render.md`](./render.md). The API sleeps
when idle, which is the price of the free plan.

**Free and always on, if you can get a VM:** one Oracle Cloud Always Free
instance running the whole stack — see [`oracle-vm.md`](./oracle-vm.md), which uses
[`docker-compose.prod.yml`](./docker-compose.prod.yml) (Caddy in front for TLS,
Postgres and Redis reachable only inside the compose network).

Two managed paths are written out below: AWS ECS Fargate and Azure App Service. Both need the same four things:

| Dependency  | AWS                          | Azure                          |
| ----------- | ---------------------------- | ------------------------------ |
| Postgres    | RDS for PostgreSQL 16        | Azure Database for PostgreSQL  |
| Redis       | ElastiCache for Redis 7      | Azure Cache for Redis          |
| Container registry | ECR                   | Azure Container Registry       |
| Public entry point | Application Load Balancer | App Service (built in)   |

## Environment variables

Everything is configured through the environment; nothing about a deployment is
baked into an image. `.env.example` at the repository root documents every
variable. The ones that must be set for a deployment:

| Variable | Required | Notes |
| -------- | -------- | ----- |
| `DATABASE_URL` | yes | `postgres://user:pass@host:5432/db`. Add `?sslmode=require` for managed Postgres. |
| `REDIS_URL` | yes | `rediss://…` when the managed cache enforces TLS. |
| `JWT_SECRET` | yes | 32+ random bytes. Rotating it invalidates every issued token, which is the intended behaviour. |
| `CORS_ORIGIN` | yes | The dashboard's public origin. Comma-separate several. |
| `PORT` | no | Defaults to 4000. |
| `SEED_USER_EMAIL` / `SEED_USER_PASSWORD` | no | **Leave unset in production.** They exist so a fresh local stack has an account to log in with. |
| `ALERT_*` | no | Thresholds; defaults are tuned to the bundled producer's traffic. |

Secrets belong in Secrets Manager or Key Vault and should be injected as
environment variables at task start, never committed. The frontend's
`VITE_API_URL` and `VITE_WS_URL` are *build* arguments, because Vite inlines
them: the image is environment-specific by construction.

## AWS: ECS Fargate behind an ALB

1. **Build and push images**

   ```bash
   aws ecr get-login-password --region "$REGION" \
     | docker login --username AWS --password-stdin "$ACCOUNT.dkr.ecr.$REGION.amazonaws.com"

   docker build -t "$ACCOUNT.dkr.ecr.$REGION.amazonaws.com/pulseboard-backend:latest" ./backend
   docker build -t "$ACCOUNT.dkr.ecr.$REGION.amazonaws.com/pulseboard-producer:latest" ./producer
   docker build \
     --build-arg VITE_API_URL=https://api.pulseboard.example.com \
     --build-arg VITE_WS_URL=https://api.pulseboard.example.com \
     -t "$ACCOUNT.dkr.ecr.$REGION.amazonaws.com/pulseboard-frontend:latest" ./frontend

   docker push "$ACCOUNT.dkr.ecr.$REGION.amazonaws.com/pulseboard-backend:latest"   # and the other two
   ```

2. **Register the task definition** in [`ecs-task-definition.json`](./ecs-task-definition.json)
   after replacing `<ACCOUNT_ID>` and `<REGION>`:

   ```bash
   aws ecs register-task-definition --cli-input-json file://deploy/ecs-task-definition.json
   ```

3. **Create the service** with the target group pointing at container port 4000
   and the health check path set to `/api/health`.

4. **Two load-balancer settings matter for WebSockets**, and getting them wrong
   produces a dashboard that reconnects every minute:

   - Raise the target group's idle timeout above the Socket.IO ping interval
     (60s is comfortable; the ALB default of 60s with a 25s ping is fine, but a
     lowered idle timeout will cut live connections).
   - An ALB speaks HTTP/1.1 upgrade natively, so no extra configuration is
     needed beyond leaving `websocket` in the transport list. If you terminate
     with CloudFront instead, enable WebSocket support on the distribution.

5. **The frontend** is static: either run its nginx image as a second service,
   or upload `frontend/dist` to S3 and serve it through CloudFront. The second
   is cheaper and is what a real deployment would do.

## Azure: App Service for Containers

1. Push the same images to ACR (`az acr build --registry <acr> --image pulseboard-backend:latest ./backend`).
2. Create a Linux Web App for Containers pointing at `pulseboard-backend`.
3. Set the application settings from the table above
   (`az webapp config appsettings set --settings DATABASE_URL=… REDIS_URL=… JWT_SECRET=…`).
4. **Turn on Web Sockets** — it is off by default and nothing works without it:

   ```bash
   az webapp config set --name <app> --resource-group <rg> --web-sockets-enabled true
   ```

5. Set the health check path to `/api/health` so App Service restarts an
   instance that has lost Postgres or Redis.
6. Deploy the frontend as a second Web App running the nginx image, or to Azure
   Static Web Apps.

## Scaling notes

Running several backend instances works without a Socket.IO Redis adapter,
which surprises people: every instance subscribes to the same Redis channel, so
every instance sees every event and can serve its own connected clients. The
adapter is for *server-to-server* emits, which this design does not use.

Two consequences are worth knowing before you scale out:

- **Duplicate writes.** Each instance tries to persist every event. The insert
  is `ON CONFLICT (id) DO NOTHING`, so the data stays correct, but the write
  load multiplies by the instance count. At that point move persistence to a
  Redis Stream with a consumer group (or a dedicated single-writer service) so
  exactly one instance owns the write path.
- **Per-instance aggregates.** Trailing-window metrics are computed in memory
  from the same event stream, so instances agree with each other, but an
  instance that has just started shows a partially filled window until it has
  been running for five minutes. It seeds its charts from Postgres on connect,
  which hides most of this from the user.

Neither is a problem at one instance, which is what the compose stack and both
deployment paths above run.
