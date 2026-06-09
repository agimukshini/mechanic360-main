# Reverse proxy — Mechanic360 / Workshop360

Single public domain: **mekaniku360.com** (frontend + API + media).

| Path | Forward to (Docker host) | Role |
|------|--------------------------|------|
| `https://mekaniku360.com/` | `:5173` | Frontend (nginx static build) |
| `https://mekaniku360.com/api/` | `:5173` → `backend:8000` | Django API (proxied by frontend nginx) |
| `https://mekaniku360.com/media/` | `:5173` → QNAP mount | Uploaded files (served by frontend nginx) |

## Docker ports

```
mechanic360-frontend    0.0.0.0:5173->80/tcp
mechanic360-backend     0.0.0.0:8001->8000/tcp
```

## Nginx Proxy Manager / Cloudflare

### mekaniku360.com (+ www)
- Forward: app server `:5173`
- Websockets: **Off** (production static build — no Vite dev/HMR)
- SSL: Let's Encrypt or Cloudflare, Force SSL

The frontend container nginx proxies `/api/` to the backend service; do **not** expose a separate API subdomain.

## Deploy

```bash
cd /opt/docker/mechanic360
cp .env.production.example .env && nano .env
docker compose -f docker-compose.yml -f docker-compose.qnap.yml -f docker-compose.prod.yml up -d --build
```

## Verify

```bash
curl -I https://mekaniku360.com
curl -I https://mekaniku360.com/api/v1/auth/me/
curl -I https://mekaniku360.com/media/vehicle_photos/
```
