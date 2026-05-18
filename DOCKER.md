# Mechanic360 Docker Setup

## Prerequisites
- Docker Desktop installed and running
- At least 4GB RAM allocated to Docker

## Quick Start

### 1. Start Docker Desktop
Make sure Docker Desktop is running before proceeding.

### 2. Build and Start Services
```bash
cd C:\Users\ARConsulting\devops\mechanic360-main
docker-compose up -d --build
```

### 3. Check Services
```bash
docker-compose ps
```

### 4. Access Services
- **Frontend**: http://localhost:5173
- **Backend API**: http://localhost:8001
- **Swagger Docs**: http://localhost:8001/api/docs/swagger/ (requires template fix)
- **ReDoc**: http://localhost:8001/api/docs/redoc/ (requires template fix)
- **Django Admin**: http://localhost:8001/admin/
- **PostgreSQL**: localhost:5432 (user: postgres, pass: postgres)
- **Redis**: localhost:6379

### 5. Default Superuser
- **Username**: admin
- **Email**: admin@mechanic360.local
- **Password**: admin123

### 6. Test the API

**Get JWT Token:**
```bash
curl -X POST http://localhost:8001/api/v1/auth/token/ \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"admin123"}'
```

**Access Protected Endpoint:**
```bash
curl http://localhost:8001/api/v1/auth/me/ \
  -H "Authorization: Bearer <your_access_token>"
```

## Services

| Service | Container | Port | Description |
|---------|-----------|------|-------------|
| db | mechanic360-db | 5432 | PostgreSQL 16 |
| redis | mechanic360-redis | 6379 | Redis 7 |
| backend | mechanic360-backend | 8001 | Django + Gunicorn |
| celery | mechanic360-celery | - | Celery Worker |
| celery-beat | mechanic360-celery-beat | - | Celery Beat Scheduler |
| frontend | mechanic360-frontend | 5173 | React + Vite + TypeScript |

### Pre-configured Tenants

| Tenant | Schema | Domain | Description |
|--------|--------|--------|-------------|
| Public | public | localhost | Default public tenant |
| Demo Workshop | demo | demo.localhost | Demo tenant with sample data |

## Common Commands

### View logs
```bash
docker-compose logs -f backend
docker-compose logs -f db
```

### Stop services
```bash
docker-compose down
```

### Stop and remove volumes (reset database)
```bash
docker-compose down -v
```

### Restart a service
```bash
docker-compose restart backend
```

### Execute commands in backend container
```bash
docker-compose exec backend python manage.py shell
docker-compose exec backend python manage.py createsuperuser
```

### Rebuild after dependency changes
```bash
docker-compose up -d --build backend
```

## Development Workflow

### Hot Reload
The backend container mounts the `./backend` directory, so code changes are reflected immediately (Gunicorn uses `--reload` flag).

### Database Migrations
```bash
docker-compose exec backend python manage.py makemigrations
docker-compose exec backend python manage.py migrate
```

### View Database
```bash
docker-compose exec db psql -U postgres -d mechanic360
```

## Troubleshooting

### Docker Desktop not running
Start Docker Desktop from the Start Menu or Applications folder.

### Port already in use
If ports 8000, 5432, or 6379 are already in use, edit `docker-compose.yml` and change the port mappings.

### Database connection issues
Wait 10-15 seconds after starting for PostgreSQL to be ready. Check with:
```bash
docker-compose logs db
```

### Rebuild everything
```bash
docker-compose down -v
docker-compose up -d --build
```

## Environment Variables

All configuration is in the `.env` file at the project root. Key variables:

| Variable | Default | Description |
|----------|---------|-------------|
| DJANGO_SECRET_KEY | dev-secret-key-... | Django secret key |
| DJANGO_DEBUG | 1 | Enable debug mode |
| POSTGRES_DB | mechanic360 | Database name |
| POSTGRES_USER | postgres | Database user |
| POSTGRES_PASSWORD | postgres | Database password |
