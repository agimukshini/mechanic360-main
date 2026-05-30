from django.db import migrations

from vehicles.photo_sync import backfill_all_tenant_hero_photos


class Migration(migrations.Migration):

    dependencies = [
        ("vehicles", "0010_backfill_hero_gallery_photos"),
    ]

    operations = [
        migrations.RunPython(backfill_all_tenant_hero_photos, migrations.RunPython.noop),
    ]
