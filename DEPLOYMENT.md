# Mechanic360 — Production Deployment

This guide covers deploying the workshop management stack beyond local Docker Compose.

## Architecture

See **[working_scope/ARCHITECTURE.md](working_scope/ARCHITECTURE.md)** for diagrams, tenant flow, and QNAP file storage.

| Component | Role |
|-----------|------|
| **Frontend** | React/Vite static build served by CDN or nginx |
| **Backend** | Django + Gunicorn (REST API) |
| **PostgreSQL** | Multi-tenant schemas (`django-tenants`) |
| **Redis** | Celery broker + cache |
| **Celery worker + beat** | Maintenance reminders |
| **QNAP NAS (LAN)** | Shared folder for uploads — photos, documents, inspection files (`MEDIA_ROOT`) |

## Prerequisites

- PostgreSQL 16+
- Redis 7+
- TLS termination (reverse proxy: nginx, Caddy, or cloud load balancer)

## Environment variables

### Backend (required in production)

```env
DJANGO_SECRET_KEY=<long-random-secret>
DJANGO_DEBUG=0
DJANGO_ALLOWED_HOSTS=api.yourdomain.com
DJANGO_SECURE_SSL_REDIRECT=1

POSTGRES_DB=mechanic360
POSTGRES_USER=mechanic360
POSTGRES_PASSWORD=<strong-password>
POSTGRES_HOST=postgres
POSTGRES_PORT=5432

CORS_ALLOWED_ORIGINS=https://app.yourdomain.com
CELERY_BROKER_URL=redis://redis:6379/0

# File storage — QNAP NAS bind mount (see working_scope/ARCHITECTURE.md)
# MEDIA_ROOT=/mnt/qnap/mechanic360-media
```

JWTs are issued as **httpOnly cookies**. The SPA must call the API with credentials:

- Frontend: `axios` `withCredentials: true` (already configured)
- Backend: `CORS_ALLOW_CREDENTIALS=True` and explicit `CORS_ALLOWED_ORIGINS` (no `*`)

If frontend and API are on different sites, set `JWT_AUTH_COOKIE_SAMESITE=None` and `JWT_AUTH_COOKIE_SECURE=True` in Django settings.

### Frontend build

```env
VITE_API_URL=https://api.yourdomain.com/api/v1
```

Build:

```bash
cd frontend
npm ci
npm run build
```

Serve `frontend/dist/` as static files.

## Deploy steps

1. **Database** — Create database and user; run migrations on the public schema:

   ```bash
   python manage.py migrate_schemas --shared
   python manage.py migrate_schemas
   ```

2. **Backend** — Gunicorn example:

   ```bash
   gunicorn mechanic360.wsgi:application --bind 0.0.0.0:8000 --workers 4
   ```

3. **Celery**

   ```bash
   celery -A mechanic360 worker -l info
   celery -A mechanic360 beat -l info
   ```

4. **Static/media** — Collect static files into `staticfiles/`. Mount the QNAP shared folder on the Docker host and bind it to `/app/media` on the backend container (see [working_scope/ARCHITECTURE.md](working_scope/ARCHITECTURE.md)).

   ```yaml
   backend:
     volumes:
       - /mnt/qnap/mechanic360-media:/app/media
   ```

5. **Health** — Verify `GET /api/v1/auth/me/` returns 401 without session; login sets cookies; tenant APIs resolve correct schema.

## Security checklist

- [ ] `DJANGO_DEBUG=0` and strong `DJANGO_SECRET_KEY`
- [ ] HTTPS everywhere; HSTS at proxy
- [ ] CORS limited to your frontend origin(s)
- [ ] Default admin password changed
- [ ] API docs disabled (only available when `DEBUG=True`)
- [ ] Rate limits active on login and tenant registration
- [ ] Role-based permissions: mechanics cannot delete clients/vehicles or edit catalog/inventory
- [ ] Backups for PostgreSQL **and** QNAP `mechanic360-media` folder (snapshots or QNAP backup job)
- [ ] QNAP share restricted to app server IP; dedicated NAS user with write access to media folder only

## Roles

| Role | Capabilities |
|------|------------|
| **Admin** | Full workshop access + user management (max 5 users) |
| **Service Advisor** | CRUD operations, catalog, inventory, analytics |
| **Mechanic** | Visits, inspections, line items; read catalog/inventory; no deletes or analytics |

## Troubleshooting

**Login works but API returns 403 on tenant routes** — Tenant middleware needs JWT in cookie or `Authorization` header; confirm `withCredentials` and CORS origin.

**Cookies not sent** — Check SameSite/Secure settings match your HTTP/HTTPS setup.

**Wrong tenant data** — Each user must have `tenant` set; schema switches per JWT user.

For local development, see `DOCKER.md`.
