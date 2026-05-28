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

echo "Ensuring platform superuser..."
python manage.py shell -c "
from accounts.models import User
from tenancy.models import WorkshopTenant

# Remove legacy Demo Workshop tenant (schema + data)
demo = WorkshopTenant.objects.filter(schema_name='demo').first()
if demo:
    User.objects.filter(tenant=demo).update(tenant=None)
    demo.delete(force_drop=True)
    print('Removed legacy Demo Workshop tenant')

admin, created = User.objects.get_or_create(
    username='admin',
    defaults={
        'email': 'admin@mechanic360.local',
        'is_superuser': True,
        'is_staff': True,
        'role': User.Role.ADMIN,
        'tenant': None,
    },
)
if created:
    admin.set_password('admin123')
    admin.save()
    print('Platform superuser created: admin / admin123')
else:
    updated = False
    if not admin.is_superuser:
        admin.is_superuser = True
        updated = True
    if not admin.is_staff:
        admin.is_staff = True
        updated = True
    if admin.tenant_id:
        admin.tenant = None
        updated = True
    if updated:
        admin.save()
        print('Platform superuser updated (no workshop tenant link)')
    else:
        print('Platform superuser OK')
"

# Collect static files
echo "Collecting static files..."
python manage.py collectstatic --noinput

echo "Starting application..."
exec "$@"
