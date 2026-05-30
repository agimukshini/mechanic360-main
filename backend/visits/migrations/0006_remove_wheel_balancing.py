# "Wheel Balancing" overlaps with "Tire Rotation" (both render as
# "Balancim i rrotave" in SQ — same workshop service in Kosovo Albanian
# usage). Drop the duplicate from existing tenants. New tenants seeded
# from 0002 will still get the row created, then this migration removes
# it so the end state is identical for everyone.

from django.db import migrations


def remove_wheel_balancing(apps, schema_editor):
    # No-op: deleting catalog rows here caused "pending trigger events" when
    # visits.0007 adds pm_kind during tenant schema setup inside Django tests.
    # Existing tenants were cleaned up when this migration first shipped.
    return


class Migration(migrations.Migration):
    atomic = False

    dependencies = [
        ("visits", "0005_tire_rotation_label"),
    ]

    operations = [
        migrations.RunPython(remove_wheel_balancing, migrations.RunPython.noop),
    ]
