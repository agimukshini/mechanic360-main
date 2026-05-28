# Bilingual service catalog (SQ + EN)

from django.db import migrations, models

from visits.service_catalog_translations import SERVICE_CATALOG_SQ


def populate_sq_translations(apps, schema_editor):
    ServiceCatalogItem = apps.get_model("visits", "ServiceCatalogItem")
    for item in ServiceCatalogItem.objects.all():
        translation = SERVICE_CATALOG_SQ.get(item.name)
        if translation:
            item.name_sq, item.description_sq = translation
        else:
            item.name_sq = item.name
            item.description_sq = item.description
        item.save(update_fields=["name_sq", "description_sq"])


class Migration(migrations.Migration):

    dependencies = [
        ("visits", "0002_seed_service_catalog"),
    ]

    operations = [
        migrations.AddField(
            model_name="servicecatalogitem",
            name="name_sq",
            field=models.CharField(blank=True, default="", max_length=255),
        ),
        migrations.AddField(
            model_name="servicecatalogitem",
            name="description_sq",
            field=models.TextField(blank=True, default=""),
        ),
        migrations.RunPython(populate_sq_translations, migrations.RunPython.noop),
    ]
