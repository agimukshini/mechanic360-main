# Re-run the SQ catalog seed for "Tire Rotation" so existing tenants pick up
# the corrected colloquial label ("Ndrrim gomash" instead of "Rrotullim
# gomash"). New tenants get the correct value from the source dict on
# 0003_service_catalog_i18n.

from django.db import migrations

from visits.service_catalog_translations import SERVICE_CATALOG_SQ


def update_tire_rotation_label(apps, schema_editor):
    ServiceCatalogItem = apps.get_model("visits", "ServiceCatalogItem")
    translation = SERVICE_CATALOG_SQ.get("Tire Rotation")
    if not translation:
        return
    name_sq, description_sq = translation
    ServiceCatalogItem.objects.filter(name="Tire Rotation").update(
        name_sq=name_sq,
        description_sq=description_sq,
    )


class Migration(migrations.Migration):

    dependencies = [
        ("visits", "0004_line_performed_by"),
    ]

    operations = [
        migrations.RunPython(update_tire_rotation_label, migrations.RunPython.noop),
    ]
