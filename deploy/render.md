# Deploying PulseBoard free on Render, Neon and Redis Cloud

No credit card at any step. You get a public URL, and the trade-off is that the
API sleeps after 15 minutes without traffic and takes about a minute to wake, so
the first person to open the link after a quiet spell waits. Everything after
that is live as normal.

Three accounts, about half an hour. Do them in this order, because each step
needs a value from the one before.

## What runs where

| Piece | Where | Free plan limits |
| ----- | ----- | ---------------- |
| Postgres | [Neon](https://neon.com) | 0.5 GB, 100 compute-hours a month, suspends after 5 minutes idle |
| Redis | [Redis Cloud](https://redis.io/try-free/) | 30 MB, 30 connections, 100 ops/sec |
| API + producer | Render web service | 750 instance-hours a month, sleeps after 15 minutes idle |
| Dashboard | Render static site | Free, always on |

The producer runs inside the API process here (`EMBEDDED_PRODUCER=true`),
because Render's free plan has no background workers. It still publishes to
Redis and the backend still consumes from it, so the architecture is unchanged —
only the process boundary moves.

Redis Cloud rather than Upstash: Upstash's free plan allows roughly 500,000
commands a month, and this app spends about three Redis commands per event.
Redis Cloud caps throughput instead of total commands, which suits a steady
stream far better.

## 1. Postgres on Neon

1. Sign up at <https://neon.com> with GitHub.
2. Create a project. Any region; pick one near you.
3. Copy the connection string from the dashboard. It looks like
   `postgresql://user:password@ep-xxx.region.aws.neon.tech/neondb?sslmode=require`.

Keep `?sslmode=require` — Neon needs TLS and the app passes the string straight
to `pg`.

## 2. Redis on Redis Cloud

1. Sign up at <https://redis.io/try-free/>.
2. Create a free Essentials database, 30 MB.
3. From the database page, note the **public endpoint** (`host:port`) and the
   **default user password**.
4. Assemble the URL: `redis://default:<password>@<host>:<port>`. If you switched
   TLS on, use `rediss://` instead.

## 3. The API on Render

New → **Web Service** → connect your GitHub account → pick `pulse_board`.

| Setting | Value |
| ------- | ----- |
| Language / runtime | Docker |
| Root Directory | `backend` |
| Dockerfile Path | `Dockerfile` |
| Instance type | Free |
| Health Check Path | `/api/health` |

Environment variables:

| Key | Value |
| --- | ----- |
| `DATABASE_URL` | the Neon string from step 1 |
| `REDIS_URL` | the Redis Cloud URL from step 2 |
| `JWT_SECRET` | 32 random bytes — `openssl rand -hex 32` |
| `EMBEDDED_PRODUCER` | `true` |
| `PRODUCER_INTERVAL_MS` | `2000` |
| `SEED_USER_EMAIL` | `demo@pulseboard.dev` (optional, gives you a login) |
| `SEED_USER_PASSWORD` | something you'll remember |
| `CORS_ORIGIN` | leave for now; set it in step 5 |

Do not set `PORT` — Render provides it and the app reads it.

Deploy. The first build takes a few minutes. When it finishes you get a URL like
`https://pulseboard-api.onrender.com`; check `/api/health` returns
`{"status":"ok","postgres":true,"redis":true,...}`. If either says false, the
connection string for that service is wrong.

## 4. The dashboard on Render

New → **Static Site** → same repository.

| Setting | Value |
| ------- | ----- |
| Root Directory | `frontend` |
| Build Command | `npm ci && npm run build` |
| Publish Directory | `dist` |

Environment variables — both are the API URL from step 3:

| Key | Value |
| --- | ----- |
| `VITE_API_URL` | `https://pulseboard-api.onrender.com` |
| `VITE_WS_URL` | `https://pulseboard-api.onrender.com` |

Then add a rewrite rule under the site's **Redirects/Rewrites**, so client-side
routing works on a refresh:

| Source | Destination | Action |
| ------ | ----------- | ------ |
| `/*` | `/index.html` | Rewrite |

## 5. Join them up

Go back to the API service, set `CORS_ORIGIN` to the static site's URL
(`https://pulseboard-web.onrender.com`), and let it redeploy. Without this the
dashboard loads but every request fails in the browser console with a CORS
error.

Open the static site URL and sign in. Give it up to a minute if the API has gone
to sleep.

## What to expect on free plans

- **Cold starts.** The API sleeps after 15 minutes idle. The dashboard will show
  "Reconnecting" while it wakes, then fill in — which at least demonstrates the
  reconnection handling.
- **Neon suspends** after 5 minutes without a connection and wakes on the next
  query, adding a few hundred milliseconds. The 100 compute-hours a month are
  comfortable precisely because the API sleeps too.
- **Event rate.** `PRODUCER_INTERVAL_MS=2000` is about one event every two
  seconds, roughly 1.5 Redis operations a second. Well inside Redis Cloud's 100
  ops/sec, and the dashboard still moves continuously.
- **History looks thin at first.** Events only accumulate while the service is
  awake, so the historical view fills in over the days you use it.

If you later want it always on, [`oracle-vm.md`](./oracle-vm.md) runs the whole
compose stack — separate producer service included — on a free VM.
