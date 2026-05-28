# Mechanic360 — Full Development Reference

## Multi-tenancy

Schema-based PostgreSQL tenant schemas (`django-tenants`). No cross-tenant reads/writes except public marketplace.

**Per-tenant:** clients, vehicles, visits, inspections, inventory, staff, reports, media metadata.

**Public:** marketplace listings, public tenant listing info.

Marketplace never exposes client, vehicle, visit, or inspection data.

## Authentication and authorization

httpOnly cookie JWT. Enforce on every protected endpoint.

| Role | Access |
|------|--------|
| Admin | Full + user management |
| Service Advisor | CRUD, catalog, inventory, analytics |
| Mechanic | Visits, inspections, lines; read catalog/inventory |

## Frontend

React 18 + TS + Vite + Tailwind. Mobile/tablet-first. Reuse layout/components. Branding: **Workshop360**, `#0077B6` — see `branding.md`.

## Docker and storage

Services: `db`, `redis`, `backend`, `celery`, `celery-beat`, `frontend`.

- Dev: volume `media_data` → `/app/media`
- Prod: QNAP bind mount → `/app/media`
- No file bytes in PostgreSQL
- S3/MinIO not used in current deployment

## Inventory

Stock deduct on material lines (backend serializers). Frontend must not set `current_stock` directly. Audit ledger is future work.

## Forbidden

Bypass tenant isolation; store uploads in DB; hardcode secrets; skip mandatory inspection; weaken auth; replace stack; delete migrations casually.

## Debugging ownership

| Problem | Layer |
|---------|--------|
| Tenant leakage | middleware, permissions, queryset |
| Visit/inspection rules | `visits/services.py`, serializers |
| Stock | `visits/serializers.py`, signals |
| Media | settings, Docker volume, QNAP mount |
| Celery reminders | `celery_tasks.py`, Redis |
