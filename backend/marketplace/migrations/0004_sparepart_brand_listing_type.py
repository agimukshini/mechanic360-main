# Generated manually for marketplace listing metadata.

from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("marketplace", "0003_seed_catalog_and_migrate_listings"),
    ]

    operations = [
        migrations.AddField(
            model_name="sparepart",
            name="brand",
            field=models.CharField(blank=True, max_length=128),
        ),
        migrations.AddField(
            model_name="sparepart",
            name="listing_type",
            field=models.CharField(
                choices=[
                    ("identified", "Catalog-identified (OEM / part number)"),
                    ("generic", "General listing (no part numbers)"),
                ],
                default="generic",
                help_text="Identified listings require OEM or supplier part number.",
                max_length=16,
            ),
        ),
    ]
