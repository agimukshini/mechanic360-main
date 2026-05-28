# Workshop staff roles: admin and mechanic only (drop service_advisor).

from django.db import migrations, models


def migrate_service_advisors_to_mechanic(apps, schema_editor):
    User = apps.get_model("accounts", "User")
    User.objects.filter(role="service_advisor").update(role="mechanic")


class Migration(migrations.Migration):

    dependencies = [
        ("accounts", "0007_staffinvitetoken"),
    ]

    operations = [
        migrations.RunPython(migrate_service_advisors_to_mechanic, migrations.RunPython.noop),
        migrations.AlterField(
            model_name="user",
            name="role",
            field=models.CharField(
                choices=[
                    ("admin", "Admin"),
                    ("mechanic", "Mechanic / Technician"),
                    ("owner", "Vehicle Owner"),
                ],
                default="mechanic",
                help_text="Determines the user's primary responsibility in the workshop.",
                max_length=32,
            ),
        ),
    ]
