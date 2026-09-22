# Deploying PulseBoard free on an Oracle Cloud Always Free VM

The whole stack — Postgres, Redis, the backend, the producer and the dashboard —
runs on one small ARM machine that Oracle gives away indefinitely. Nothing
sleeps, nothing expires after 30 days, and the app behaves exactly as it does
locally because it is the same compose stack.

Budget 30 to 45 minutes, most of it waiting for the account and the first build.

## 1. Create the account

<https://www.oracle.com/cloud/free/>. A card is required for identity
verification and is not charged for Always Free resources. Approval is usually
minutes but can take hours, so start here first.

Pick your home region carefully — it cannot be changed, and free ARM capacity
varies a lot between regions.

## 2. Create the instance

Compute → Instances → **Create instance**.

| Setting | Value |
| ------- | ----- |
| Image | Canonical Ubuntu 24.04 |
| Shape | **VM.Standard.A1.Flex** (Ampere ARM), marked "Always Free eligible" |
| OCPUs / memory | 2 OCPU, 12 GB — the Always Free maximum since July 2026 |
| Boot volume | 50 GB is plenty |
| SSH keys | Upload your public key, or let Oracle generate one and save it |

If you get **"Out of host capacity"**, that is normal for free ARM shapes. Try a
different availability domain, or retry later — capacity is released constantly.
Do not fall back to the Always Free AMD micro shape for this: 1 GB of RAM is not
enough to build the images.

Note the instance's **public IP address** when it finishes provisioning.

## 3. Open the ports in the VCN

This is the step everyone forgets, and it makes a perfectly healthy deployment
look dead from outside.

Networking → Virtual Cloud Networks → your VCN → Security Lists → the default
list → **Add Ingress Rules**:

| Source CIDR | Protocol | Destination port |
| ----------- | -------- | ---------------- |
| 0.0.0.0/0 | TCP | 80 |
| 0.0.0.0/0 | TCP | 443 |

## 4. Prepare the machine

```bash
ssh ubuntu@<YOUR_PUBLIC_IP>

curl -fsSL https://raw.githubusercontent.com/vishalreddy9514/pulse_board/main/deploy/vm-bootstrap.sh -o vm-bootstrap.sh
less vm-bootstrap.sh    # read it before running it
bash vm-bootstrap.sh
newgrp docker           # or log out and back in
```

The script installs Docker and opens ports 80 and 443 in the machine's own
firewall, which Oracle's Ubuntu images block by default.

## 5. Deploy

```bash
git clone https://github.com/vishalreddy9514/pulse_board.git
cd pulse_board
cp deploy/.env.prod.example .env

openssl rand -hex 16    # paste as POSTGRES_PASSWORD
openssl rand -hex 32    # paste as JWT_SECRET
nano .env               # also set PUBLIC_URL=http://<YOUR_PUBLIC_IP>
```

To hand someone a working login, set `SEED_USER_EMAIL` and
`SEED_USER_PASSWORD` too. Leave them empty and register an account yourself
instead if the deployment is not a demo.

```bash
docker compose -f deploy/docker-compose.prod.yml up -d --build
```

The first build takes several minutes on a free ARM instance — it compiles the
backend, the producer and the Vite bundle. Then:

```bash
docker compose -f deploy/docker-compose.prod.yml ps        # all services up
curl -s localhost/api/health                               # {"status":"ok",...}
docker compose -f deploy/docker-compose.prod.yml logs -f backend
```

Open `http://<YOUR_PUBLIC_IP>` and sign in. The cards should start moving within
a few seconds.

## 6. Add a domain and HTTPS (optional)

Certificates cannot be issued for a bare IP address, so HTTPS needs a hostname.
Point an A record at the instance's IP, then:

```bash
# in .env
PUBLIC_URL=https://pulseboard.example.com
CADDY_SITE_ADDRESS=pulseboard.example.com

docker compose -f deploy/docker-compose.prod.yml up -d --build
```

Caddy requests a Let's Encrypt certificate on first start and renews it on its
own. The rebuild is needed because Vite inlines the public URL into the bundle.

A free option if you have no domain: a subdomain from DuckDNS or similar works
with Caddy exactly the same way.

## Running it

```bash
# what is running
docker compose -f deploy/docker-compose.prod.yml ps

# update to the latest main
git pull && docker compose -f deploy/docker-compose.prod.yml up -d --build

# stop the traffic without tearing anything down
docker compose -f deploy/docker-compose.prod.yml stop producer

# tear it down, keeping the database
docker compose -f deploy/docker-compose.prod.yml down

# tear it down including the data
docker compose -f deploy/docker-compose.prod.yml down -v
```

The producer writes about 170,000 events a day, which is roughly 25 MB in
Postgres. On a 50 GB boot volume that is fine for months, but if you leave it
running for a year, stop the producer between demos or add a retention job.

## If something is not working

| Symptom | Cause |
| ------- | ----- |
| Browser hangs, `curl localhost/api/health` works on the box | VCN ingress rules missing (step 3) |
| Same, and the bootstrap script was skipped | The machine's own iptables still rejects 80 and 443 |
| Dashboard loads, login fails, console shows CORS | `PUBLIC_URL` does not match the URL you opened; rebuild after fixing |
| Login works, socket never connects | Check `docker compose ... logs caddy` — the proxy must pass `/socket.io/*` |
| Build killed partway through | Not enough memory; use the ARM shape, not the AMD micro |
