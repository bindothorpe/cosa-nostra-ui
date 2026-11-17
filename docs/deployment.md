# Coolify Deployment Runbook

This repo is a two-service Docker Compose stack:

- `web` — Next.js standalone, port 3000
- `realtime` — Node + WebSocket, port 3001, snapshot volume `/data`

Coolify can deploy it directly from a Git repository with `compose.yaml` as the
compose file. You do **not** need a separate database, Redis, or managed realtime
service.

## Where resources actually run

Coolify separates the **control plane** from **target servers**:

- The Coolify instance (often shown as server `localhost`) stores metadata: projects,
  environment variables, deployment history, and configuration.
- A resource runs on the **server selected when the resource is created/deployed**.
  That target server runs the Docker containers, images, networks, and named volumes.
- Each target server needs its own proxy configuration (Coolify-managed Traefik/Caddy,
  or Custom/nginx). Domains must be configured on the server hosting the resource.
- Volumes do not move automatically between servers. Moving a resource to another server
  requires migrating its data volume separately.
- The control plane needs SSH access to the target. If the target is offline or its
  Docker daemon is unavailable, deployments fail.

For this project, open the Compose resource in Coolify and check its **Server**. On that
server’s Terminal:

```bash
docker ps
docker volume ls
```

The `web`, `realtime`, and `room-data` volume should be there. They will not appear on a
server where the resource was not deployed.

## Choosing the ingress topology

Only one process can own ports 80/443. Pick one:

| Situation | Recommendation |
|---|---|
| Dedicated VPS for Coolify | Let Coolify own 80/443 with Traefik/Caddy. Domains, TLS, and previews are automatic. Cleanest long-term. |
| Shared server with an existing nginx serving other sites | Keep nginx. Set Coolify proxy type to **Custom**, expose the app on loopback ports, and add one nginx server block. |
| A few apps on a shared server | nginx front door is fine. Keep per-app configs in version control and automate cert renewal. |
| Many Coolify apps / preview deployments expected | Move Coolify to its own VPS/VM with 80/443 free. Manual nginx routing becomes the bottleneck. |
| No public ports available | Cloudflare Tunnel from the Coolify host. |

Do not run two proxies on the same ports. If nginx already owns 80/443, Coolify’s
Traefik cannot bind and Coolify domain settings will not create routes.

### Coolify control plane and apps on one server

Co-locating Coolify with the apps is normal and fine for a small deployment. The
control plane is lightweight; app containers share the server’s Docker daemon,
CPU, RAM, disk, and network.

Use one server when:

- one or a few low-traffic apps
- hobby/personal use
- you want simple networking and one backup target

Split control plane and app servers when:

- apps are critical or need independent failure domains
- multiple teams/customers need isolation
- apps are resource-heavy or need per-app limits
- security/compliance requires separation
- the control plane must survive an app-server outage

Either way, one process must own 80/443 on each public server. Mixing host nginx
and Coolify’s Traefik on the same ports is the problem to avoid.

---

## 1. Prerequisites

- VPS: Ubuntu 24.04, 4 GB RAM recommended (2 GB minimum), 2 vCPU, 40 GB SSD.
- Coolify installed and reachable over HTTPS.
- Domain control. Example: `game.example.com`.
- GitHub/GitLab repository containing this project.
- Ports 22, 80, 443 open on the VPS. Keep Coolify’s dashboard (8000) restricted
  to trusted IPs or an SSH tunnel.

DNS:

| Type | Name | Value |
|---|---|---|
| A | `game.example.com` | VPS IPv4 |
| AAAA | `game.example.com` | VPS IPv6, optional |

### Finding the VPS public IP

`hostname -I` and `ip addr` show interface addresses, which are often private
(`10.x`, `192.168.x`, `172.16–31.x`). Ask the server itself what the internet
sees:

```bash
curl -4 -s https://ifconfig.me
curl -4 -s https://api.ipify.org
curl -4 -s https://ifconfig.co
```

From your laptop, if you can SSH in:

```bash
ssh user@server 'curl -4 -s https://ifconfig.me'
```

Or use the terminal in Coolify (Server → Terminal) and run the same command. The
Coolify server settings page may also show the detected IP, but verify it with an
external lookup — detected IPs can be private.

If the server is behind a home router/NAT, the public IP belongs to the router;
ports 80 and 443 must be forwarded to the server, or use a tunnel/hosted proxy.

### Cloudflare DNS and proxy

- `A` record: the **public IPv4** from the lookup above. Add `AAAA` only if the
  server has a working public IPv6.
- **First deploy: set Cloudflare proxy to DNS only (grey cloud).** This lets
  Coolify/Traefik complete Let's Encrypt HTTP validation and makes Coolify's DNS
  check see the real origin IP.
- Once HTTPS works on the origin, you can enable the orange-cloud proxy:
  - SSL/TLS mode: **Full (strict)**.
  - Never use **Flexible** with Coolify — it causes redirect loops.
  - WebSockets are supported on the standard HTTPS port; this app uses
    `wss://game.example.com/rt/ws`, so no special port is needed.
- With the proxy on, Coolify's “DNS matches” check may fail because the hostname
  resolves to Cloudflare IPs. That is expected; the origin is still the VPS.
- Cloudflare only proxies standard HTTP/HTTPS ports. Keep Coolify's internal
  ports in the domain field; do not browse to `:3000` or `:3001`.

If WebSockets fail only with the proxy enabled, temporarily switch back to grey
cloud to isolate whether the issue is Cloudflare or Coolify.

### Existing host nginx (Coolify Custom Proxy)

If the server already runs nginx on 80/443 — for example because the Coolify
dashboard is served at `coolify.example.com` through that nginx — Coolify's own
proxy cannot bind those ports. Set the Coolify server proxy type to
**Custom / None** and let nginx route to the Compose services.

`compose.yaml` binds both services on loopback for this case:

```yaml
web:      ports: ["127.0.0.1:3000:3000"]
realtime: ports: ["127.0.0.1:3001:3001"]
```

These are not publicly reachable. The host nginx proxies to them.

Use [`deploy/nginx/cosa-nostra.conf.example`](../deploy/nginx/cosa-nostra.conf.example)
as the starting config:

- `/` → `http://127.0.0.1:3000`
- `/rt/` → `http://127.0.0.1:3001`, with WebSocket upgrade headers
- The `/rt` prefix is preserved; the realtime server also accepts stripped paths

Then:

```bash
sudo nginx -t
sudo systemctl reload nginx
sudo certbot --nginx -d cosa-nostra.bindothorpe.com
```

Set `ALLOWED_ORIGINS=https://cosa-nostra.bindothorpe.com` and redeploy.

Coolify’s domain fields do **not** configure an external nginx. The hostname and
port mapping live in nginx; the Coolify domain entry is informational in Custom
Proxy mode. Do not switch Coolify back to Traefik while nginx owns 80/443.

---

## 2. Create the Coolify resource

1. Coolify → Project → **+ New Resource**.
2. Choose **Docker Compose** → **Git repository**.
3. Repository: this repo. Branch: `main` (or your deploy branch).
4. Base directory: `/`.
5. Docker Compose location: `/compose.yaml`.
6. Build pack: Docker Compose (not Nixpacks).
7. Save.

Coolify builds both services with their Dockerfiles and keeps the `room-data`
named volume.

---

## 3. Environment variables

Set these on the Coolify resource (runtime):

| Variable | Value |
|---|---|
| `ALLOWED_ORIGINS` | `https://game.example.com` |
| `LOG_LEVEL` | `info` |
| `ROOM_LOBBY_TTL_MS` | `7200000` |
| `ROOM_GAMEOVER_TTL_MS` | `900000` |
| `SNAPSHOT_DEBOUNCE_MS` | `250` |

Build-time web variables:

| Variable | Value |
|---|---|
| `NEXT_PUBLIC_GAME_MODE` | `live` |
| `NEXT_PUBLIC_REALTIME_BASE` | empty for same-origin `/rt` |

`NEXT_PUBLIC_*` values are baked into the web image at build time. The web
Dockerfile defaults `NEXT_PUBLIC_GAME_MODE` to `live`, so this is usually enough.
For the two-subdomain fallback, set `NEXT_PUBLIC_REALTIME_BASE` before building.

A copy is in `deploy/coolify.env.example`.

---

## 4. Domains and routing

### Preferred: one hostname, `/rt` to realtime

Assign per-service domains in Coolify:

| Service | Domain value | Internal port |
|---|---|---|
| `web` | `https://game.example.com:3000` | 3000 |
| `realtime` | `https://game.example.com:3001/rt` | 3001 |

What happens:

- `/` and app routes go to `web`.
- `/rt/*` goes to `realtime`.
- Coolify’s path prefix is stripped by default: `/rt/ws` arrives at realtime as
  `/ws`, `/rt/health` as `/health`, `/rt/rooms` as `/rooms`.
- The realtime server accepts **both** prefixed and stripped paths, so it works
  either way. If you enable **Advanced → Proxy → Keep paths as-is**, `/rt/*` also
  works unchanged.
- The browser derives `wss://game.example.com/rt/ws` from the page origin. No
  build-time URL is needed.

The port in the domain value is the **internal container port**, not a public
port. Coolify/Traefik terminates TLS and routes internally.

Do not add host `ports:` mappings for these services. The compose stack uses
`expose`, which is correct for proxy routing.

### Fallback: two hostnames

If your Coolify version has trouble with a path-prefixed Compose domain:

| Service | Domain value | Internal port |
|---|---|---|
| `web` | `https://game.example.com:3000` | 3000 |
| `realtime` | `https://rt.example.com:3001` | 3001 |

Set:

```dotenv
NEXT_PUBLIC_REALTIME_BASE=https://rt.example.com/rt
ALLOWED_ORIGINS=https://game.example.com
```

Add DNS for `rt.example.com`. The client then uses
`wss://rt.example.com/rt/ws`. Same-origin path routing is preferred because it
avoids a second hostname and a build-time URL.

---

## 5. Persistent room snapshots

`compose.yaml` mounts the named volume `room-data` at `/data`. Coolify keeps
named volumes across redeploys.

- Snapshot files: `/data/rooms/<CODE>.json`
- Write policy: temp file + fsync + atomic rename, debounced 250 ms
- No database and no backups required for normal play; rooms are ephemeral
- If the volume is lost, active rooms are lost. Finished games are disposable.

Verify after deploy:

```bash
docker compose -f compose.yaml exec realtime ls -la /data/rooms
```

(or use Coolify’s container terminal).

---

## 6. Healthchecks and monitoring

Compose already defines:

| Service | Healthcheck |
|---|---|
| `web` | `GET /` on `127.0.0.1:3000` |
| `realtime` | `GET /rt/health` on `127.0.0.1:3001` |

Post-deploy checks:

```bash
curl -I https://game.example.com/
curl https://game.example.com/rt/health
```

Expected:

```json
{"ok":true,"rooms":0,"sockets":0,"uptimeSeconds":1,"version":"0.1.0"}
```

Add external uptime monitors (Better Stack, UptimeRobot, etc.):

- `https://game.example.com/` — app up
- `https://game.example.com/rt/health` — realtime up

Alert after two consecutive failures. `/rt/health` reports room/socket counts and
process uptime.

---

## 7. Deploy, redeploy, rollback

First deploy:

1. Set env + domains.
2. Click **Deploy**.
3. Watch build logs for both images.
4. Confirm web and realtime become healthy.
5. Open the site from a phone and a laptop.
6. Create a room, join from the second device, and confirm the player list updates.

Redeploy during a game:

- **Web redeploy:** safe. Sockets live in `realtime`.
- **Realtime redeploy:** all sockets drop. Clients reconnect with backoff and
  restore their seat from the snapshot. Avoid redeploying in the last minute of a
  game.
- One realtime replica only. Do not scale it horizontally.

Rollback:

- Redeploy the previous commit/image in Coolify.
- Snapshot schema is versioned. If a release changes the snapshot shape
  incompatibly, add migration before rolling forward.

---

## 8. Coolify-specific gotchas

- Use a **Docker Compose** resource, not a single Application; this repo builds
  two services.
- Domains belong to individual Compose services.
- The port in the domain is internal. Do not publish 3001 to the host.
- Path prefixes are stripped by default; this app handles both forms.
- If the realtime service is assigned a path but returns 404, check whether
  Coolify forwarded `/rt/ws` or `/ws`; both are accepted, so a 404 usually means
  the domain/port is attached to the wrong service.
- Build variables (`NEXT_PUBLIC_*`) must be present at image build time. Runtime
  env changes do not alter an already-built web bundle.
- Keep the realtime container at exactly one replica. In-memory rooms are not
  shareable across replicas.
- `ALLOWED_ORIGINS` must include the exact public web origin, with scheme and no
  trailing slash. Add `http://<LAN-IP>:8080` only for local testing.

---

## 9. Troubleshooting

| Symptom | Check |
|---|---|
| Timeout on `*.10.x.x.x.sslip.io` | The sslip subdomain encodes a private IP. Use a real domain or `<public-ip>.sslip.io`; “DNS matches” only compares against Coolify’s detected server IP |
| Timeout on a real domain | DNS A/AAAA → VPS public IP; ports 80/443 open in the provider firewall and `ufw`; Coolify proxy container running |
| Browser URL ends in `:3000` | Wrong. `:3000` in the Coolify domain field is the **internal** container port; browse `https://game.example.com` |
| TLS cert name mismatch | Coolify still has the old domain or no router/cert for this hostname; update the web domain, enable HTTPS, redeploy, then check ACME logs |
| ACME `NXDOMAIN` for `www.example.com` | Coolify’s WWW redirect is requesting a cert for a name with no DNS record. Disable the WWW redirect or add the `www` A/CNAME record |
| `curl` shows `Server: nginx/...`, a default page, or another site’s cert | DNS points at a different server, or host nginx owns 80/443. Confirm the Coolify VPS public IP; check `ss -ltnp` and `docker ps` |
| Web loads, socket fails | `ALLOWED_ORIGINS`, `/rt/ws` routing, TLS/WSS, proxy upgrade support |
| 503 from Coolify | Domain attached to wrong service or wrong internal port |
| 404 on `/rt/health` | Try `/health`; confirm realtime service domain |
| `ROOM_NOT_FOUND` after redeploy | `room-data` volume missing or `DATA_DIR` wrong |
| Players drop after idle | Proxy idle timeout vs 25s heartbeat; increase proxy idle timeout |
| Older tab closed with 4001 | Newest-socket-wins policy; expected |
| High memory | Stale rooms not cleaned up; inspect `/rt/health` and volume |
| Role leak | Run projection tests; inspect sync frames in dev only |

---

## 10. Local production-like verification

Before deploying, run the same stack locally:

```bash
docker compose -f compose.local.yaml up --build
```

Open `http://localhost:8080`. Caddy mirrors the one-host `/rt` routing.

Full checks:

```bash
pnpm typecheck
pnpm lint
pnpm test
pnpm test:integration
pnpm test:e2e
pnpm build
pnpm build:realtime
```
