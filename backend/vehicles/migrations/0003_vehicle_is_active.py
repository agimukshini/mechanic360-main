from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("vehicles", "0002_vehicledocument"),
    ]

    operations = [
        migrations.AddField(
            model_name="vehicle",
            name="is_active",
            field=models.BooleanField(
                default=True,
                help_text="Inactive vehicles are archived and hidden from default lists.",
            ),
        ),
    ]
