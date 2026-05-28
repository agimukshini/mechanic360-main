# Reverse proxy — Mechanic360 / Workshop360

| URL | Forward to (host 192.168.10.5) | Role |
|-----|--------------------------------|------|
| **mechanic360.managefleet.org** | `:5173` | Frontend (nginx static build) |
| **backmechanic.managefleet.org** | `:8001` | Django API |

## Docker ports

```
mechanic360-frontend    0.0.0.0:5173->5173/tcp
mechanic360-backend     0.0.0.0:8001->8000/tcp
nginx-proxy-manager     0.0.0.0:80,443,81
```

## Nginx Proxy Manager (http://192.168.10.5:81)

### mechanic360.managefleet.org
- Forward: `192.168.10.5:5173`
- Websockets: **Off** (production static build — no Vite dev/HMR)
- SSL: Let's Encrypt, Force SSL

### backmechanic.managefleet.org
- Forward: `192.168.10.5:8001`
- SSL: Let's Encrypt, Force SSL

## Deploy with domains

```bash
cd /opt/docker/mechanic360
cp .env.production.example .env && nano .env
docker compose -f docker-compose.yml -f docker-compose.qnap.yml -f docker-compose.prod.yml up -d --build
```

## Verify

```bash
curl -I https://mechanic360.managefleet.org
curl -I https://backmechanic.managefleet.org/api/v1/auth/me/
```
