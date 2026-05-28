# Mechanic360 Agent Development Rules

Use this document for **all feature work, bugfixes, and refactors** in this repository.
(Cursor skill equivalent — place in `.cursor/skills/mechanic360/` when repo permissions allow.)

## Quick start

1. Read `working_scope/ARCHITECTURE.md` and `working_scope/working_scope.md`
2. Identify owning layer (backend service vs frontend UX vs Docker/media)
3. Validate **only via Docker Compose** — never host `npm`/`pip` for this project

```bash
docker compose ps
docker compose exec backend python manage.py check
docker compose exec backend python manage.py test
docker compose exec frontend npm run build
```

## Backend validation priorities

Use DRF serializers for validation. Do not trust frontend validation alone.

Use service-layer functions where a workflow touches multiple models:

- closing a visit → `visits/services.py`, `visits/completion.py`
- deducting materials from stock → `visits/serializers.py`
- generating next service reminders → `visits/celery_tasks.py`
- transferring vehicle ownership (future)
- creating inspection records with photos → `inspections/`

Do not place complex workflow logic directly inside views.

## Mandatory visit workflow

1. Scan/search vehicle → 2. Start visit → 3. Mileage/hours → 4. **360° inspection** → 5. Services → 6. Materials (stock deduct) → 7. Finish → 8. Report/reminder/sticker

Backend must reject finish/complete without a completed inspection checklist.

## Multi-tenancy, auth, media, branding

See [DEVELOPMENT_REFERENCE.md](DEVELOPMENT_REFERENCE.md) for full rules on tenant isolation, roles, QNAP `MEDIA_ROOT`, marketplace privacy, forbidden behaviors, and Workshop360 branding.

## Agent output format

```markdown
## Finding
## Architecture Rule Applied
## Change Made
## Validation
## Remaining Risks
```
