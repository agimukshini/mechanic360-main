# Optional workshop client on vehicles; visits may omit client when vehicle has no owner.

import django.db.models.deletion
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("clients", "0001_initial"),
        ("vehicles", "0005_vehicle_assigned_mechanic"),
    ]

    operations = [
        migrations.AlterField(
            model_name="vehicle",
            name="owner",
            field=models.ForeignKey(
                blank=True,
                null=True,
                on_delete=django.db.models.deletion.PROTECT,
                related_name="vehicles",
                to="clients.client",
            ),
        ),
        migrations.AlterField(
            model_name="servicevisit",
            name="client",
            field=models.ForeignKey(
                blank=True,
                null=True,
                on_delete=django.db.models.deletion.PROTECT,
                related_name="visits",
                to="clients.client",
            ),
        ),
    ]
