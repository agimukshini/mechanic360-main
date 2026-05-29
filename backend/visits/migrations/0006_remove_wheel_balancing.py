# "Wheel Balancing" overlaps with "Tire Rotation" (both render as
# "Balancim i rrotave" in SQ — same workshop service in Kosovo Albanian
# usage). Drop the duplicate from existing tenants. New tenants seeded
# from 0002 will still get the row created, then this migration removes
# it so the end state is identical for everyone.

from django.db import migrations


def remove_wheel_balancing(apps, schema_editor):
    ServiceCatalogItem = apps.get_model("visits", "ServiceCatalogItem")
    VisitServiceLine = apps.get_model("visits", "VisitServiceLine")
    items = ServiceCatalogItem.objects.filter(name="Wheel Balancing")
    for item in items:
        # ForeignKey from VisitServiceLine.catalog_item is on_delete=SET_NULL,
        # but be explicit so historical visits keep their plain-text descriptions
        # without surprise.
        VisitServiceLine.objects.filter(catalog_item=item).update(catalog_item=None)
        item.delete()


class Migration(migrations.Migration):

    dependencies = [
        ("visits", "0005_tire_rotation_label"),
    ]

    operations = [
        migrations.RunPython(remove_wheel_balancing, migrations.RunPython.noop),
    ]
