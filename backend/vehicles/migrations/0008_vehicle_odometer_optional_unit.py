from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("vehicles", "0007_vehicle_description"),
    ]

    operations = [
        migrations.AddField(
            model_name="vehicle",
            name="odometer_unit",
            field=models.CharField(
                choices=[("km", "Kilometers"), ("mi", "Miles")],
                default="km",
                max_length=2,
            ),
        ),
        migrations.AlterField(
            model_name="vehicle",
            name="odometer_km",
            field=models.PositiveIntegerField(blank=True, null=True),
        ),
        migrations.AlterField(
            model_name="vehicle",
            name="hour_meter",
            field=models.PositiveIntegerField(blank=True, null=True),
        ),
    ]
