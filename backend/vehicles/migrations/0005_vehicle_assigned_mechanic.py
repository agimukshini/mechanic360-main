# Vehicle mechanic assignment

import django.db.models.deletion
from django.conf import settings
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("vehicles", "0004_vehicle_global_vehicle_id"),
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]

    operations = [
        migrations.AddField(
            model_name="vehicle",
            name="assigned_mechanic",
            field=models.ForeignKey(
                blank=True,
                help_text="Primary workshop mechanic responsible for this vehicle.",
                null=True,
                on_delete=django.db.models.deletion.SET_NULL,
                related_name="assigned_vehicles",
                to=settings.AUTH_USER_MODEL,
            ),
        ),
    ]
