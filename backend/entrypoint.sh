#!/bin/bash
set -e

echo "Waiting for PostgreSQL..."
while ! pg_isready -h "$POSTGRES_HOST" -U "$POSTGRES_USER" -d "$POSTGRES_DB"; do
  sleep 1
done
echo "PostgreSQL is ready!"

# Run migrations
echo "Running migrations..."
python manage.py migrate --noinput

# Demo admin must belong to a tenant schema (clients/vehicles live per-tenant)
echo "Checking demo admin..."
python manage.py shell -c "
from accounts.models import User
from tenancy.models import WorkshopTenant

tenant, _ = WorkshopTenant.objects.get_or_create(
    schema_name='demo',
    defaults={'name': 'Demo Workshop'},
)
admin, created = User.objects.get_or_create(
    username='admin',
    defaults={
        'email': 'admin@mechanic360.local',
        'is_superuser': True,
        'is_staff': True,
        'role': User.Role.ADMIN,
        'tenant': tenant,
    },
)
if created:
    admin.set_password('admin123')
    admin.save()
    print('Demo admin created: admin / admin123 (tenant: demo)')
else:
    updated = False
    if not admin.tenant_id:
        admin.tenant = tenant
        updated = True
    if not admin.role:
        admin.role = User.Role.ADMIN
        updated = True
    if updated:
        admin.save(update_fields=['tenant', 'role'])
        print('Linked existing admin user to demo workshop')
    else:
        print('Demo admin OK')
"

# Collect static files
echo "Collecting static files..."
python manage.py collectstatic --noinput

echo "Starting application..."
exec "$@"
