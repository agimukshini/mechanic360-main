from django.contrib.auth.hashers import make_password
from django.db import migrations, models


def set_demo_admin_pin(apps, schema_editor):
    User = apps.get_model("accounts", "User")
    User.objects.filter(username="admin", quick_pin="").update(
        quick_pin=make_password("1234"),
    )


class Migration(migrations.Migration):

    dependencies = [
        ("accounts", "0002_notification"),
    ]

    operations = [
        migrations.AddField(
            model_name="user",
            name="quick_pin",
            field=models.CharField(
                blank=True,
                default="",
                help_text="Hashed numeric PIN for quick sign-in at the workshop.",
                max_length=128,
            ),
        ),
        migrations.RunPython(set_demo_admin_pin, migrations.RunPython.noop),
    ]
