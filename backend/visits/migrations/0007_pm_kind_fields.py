"""Add pm_kind to service catalog and maintenance plans."""

from django.db import migrations, models

REGULAR_NAMES = {
    "Oil Change",
    "Air Filter Replacement",
    "Cabin Air Filter Replacement",
    "Coolant Flush",
    "Brake Fluid Flush",
    "Fuel Filter Replacement",
    "Battery Diagnostic",
    "360° Vehicle Inspection",
    "General Diagnostic",
    "Emissions Test",
    "Windshield Wiper Replacement",
}

MAJOR_NAMES = {
    "Engine Tune-Up",
    "Timing Belt Replacement",
    "Full Brake Service",
    "Transmission Fluid Change",
    "Transmission Flush",
    "Clutch Replacement",
    "Transmission Repair",
    "AC Compressor Replacement",
    "Pre-Purchase Inspection",
    "Check Engine Light Diagnostic",
}

TIRE_NAMES = {
    "Tire Rotation",
    "Tire Replacement",
    "Wheel Alignment",
    "Flat Tire Repair",
}


def tag_catalog_pm_kinds(apps, schema_editor):
    ServiceCatalogItem = apps.get_model("visits", "ServiceCatalogItem")
    for name in REGULAR_NAMES:
        ServiceCatalogItem.objects.filter(name=name).update(pm_kind="regular_service")
    for name in MAJOR_NAMES:
        ServiceCatalogItem.objects.filter(name=name).update(pm_kind="major_service")
    for name in TIRE_NAMES:
        ServiceCatalogItem.objects.filter(name=name).update(pm_kind="tire_change")


class Migration(migrations.Migration):
    atomic = False

    dependencies = [
        ("visits", "0006_remove_wheel_balancing"),
    ]

    operations = [
        migrations.AddField(
            model_name="servicecatalogitem",
            name="pm_kind",
            field=models.CharField(
                blank=True,
                default="",
                help_text="When set, this catalog service counts toward preventive maintenance offers.",
                max_length=32,
            ),
        ),
        migrations.AddField(
            model_name="preventivemaintenanceplan",
            name="pm_kind",
            field=models.CharField(
                blank=True,
                default="regular_service",
                help_text="Type of PM work order to publish when this plan is due.",
                max_length=32,
            ),
        ),
        migrations.RunPython(tag_catalog_pm_kinds, migrations.RunPython.noop),
    ]
