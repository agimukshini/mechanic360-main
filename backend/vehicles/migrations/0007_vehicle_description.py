from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("vehicles", "0006_vehicle_optional_owner"),
    ]

    operations = [
        migrations.AddField(
            model_name="vehicle",
            name="description",
            field=models.TextField(
                blank=True,
                help_text="Workshop notes about this vehicle (condition, modifications, etc.).",
            ),
        ),
    ]
