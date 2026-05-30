from django.db import migrations

from vehicles.photo_sync import backfill_all_tenant_hero_photos


class Migration(migrations.Migration):

    dependencies = [
        ("vehicles", "0009_alter_vehicle_owner_vehiclegalleryphoto"),
        ("global_vehicles", "0005_backfill_gallery_photos"),
    ]

    operations = [
        migrations.RunPython(backfill_all_tenant_hero_photos, migrations.RunPython.noop),
    ]
