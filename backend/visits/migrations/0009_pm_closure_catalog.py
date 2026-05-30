"""PM closure catalog items — zero-price lines that close planned maintenance."""

from django.db import migrations, models

from global_vehicles.pm_kinds import PMKind

PM_CLOSURE_ITEMS = (
    {
        "name": "PM — Regular service",
        "name_sq": "Shërbim i planifikuar — servis i rregullt",
        "description": "Closes an open regular-service PM work order (no charge).",
        "description_sq": "Mbyll urdhrin e PM për servisin e rregullt (pa pagesë).",
        "pm_kind": PMKind.REGULAR,
    },
    {
        "name": "PM — Major service",
        "name_sq": "Shërbim i planifikuar — servis i madh",
        "description": "Closes an open major-service PM work order (no charge).",
        "description_sq": "Mbyll urdhrin e PM për servisin e madh (pa pagesë).",
        "pm_kind": PMKind.MAJOR,
    },
    {
        "name": "PM — Tire change",
        "name_sq": "Shërbim i planifikuar — ndrrim gomash",
        "description": "Closes an open tire-change PM work order (no charge).",
        "description_sq": "Mbyll urdhrin e PM për ndrrimin e gomave (pa pagesë).",
        "pm_kind": PMKind.TIRE,
    },
)


def seed_pm_closure_items(apps, schema_editor):
    ServiceCatalogItem = apps.get_model("visits", "ServiceCatalogItem")
    for row in PM_CLOSURE_ITEMS:
        ServiceCatalogItem.objects.get_or_create(
            name=row["name"],
            defaults={
                "name_sq": row["name_sq"],
                "description": row["description"],
                "description_sq": row["description_sq"],
                "default_duration_hours": 0,
                "default_price": 0,
                "pm_kind": row["pm_kind"],
                "is_pm_closure": True,
                "is_active": True,
            },
        )


class Migration(migrations.Migration):
    dependencies = [
        ("visits", "0008_pm_plan_seasonal_schedule"),
    ]

    operations = [
        migrations.AddField(
            model_name="servicecatalogitem",
            name="is_pm_closure",
            field=models.BooleanField(
                default=False,
                help_text=(
                    "When true, adding this catalog line to a visit closes the matching open PM "
                    "order on finish. Closure lines are always priced at zero."
                ),
            ),
        ),
        migrations.RunPython(seed_pm_closure_items, migrations.RunPython.noop),
    ]
