# Generated manually for cross-tenant PM work orders.

import uuid

import django.db.models.deletion
from django.conf import settings
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("tenancy", "0001_initial"),
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
        ("global_vehicles", "0005_backfill_gallery_photos"),
    ]

    operations = [
        migrations.CreateModel(
            name="PreventiveMaintenanceOrder",
            fields=[
                ("id", models.UUIDField(default=uuid.uuid4, editable=False, primary_key=True, serialize=False)),
                (
                    "pm_kind",
                    models.CharField(
                        choices=[
                            ("regular_service", "Regular service"),
                            ("major_service", "Major service"),
                            ("tire_change", "Tire change"),
                        ],
                        db_index=True,
                        max_length=32,
                    ),
                ),
                (
                    "status",
                    models.CharField(
                        choices=[
                            ("open", "Open"),
                            ("completed", "Completed"),
                            ("cancelled", "Cancelled"),
                        ],
                        db_index=True,
                        default="open",
                        max_length=16,
                    ),
                ),
                ("due_date", models.DateField(blank=True, null=True)),
                ("due_odometer_km", models.PositiveIntegerField(blank=True, null=True)),
                ("title", models.CharField(blank=True, max_length=255)),
                ("notes", models.TextField(blank=True)),
                ("source_plan_id", models.UUIDField(blank=True, db_index=True, null=True)),
                ("completed_at", models.DateTimeField(blank=True, null=True)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("updated_at", models.DateTimeField(auto_now=True)),
                (
                    "completed_by_tenant",
                    models.ForeignKey(
                        blank=True,
                        null=True,
                        on_delete=django.db.models.deletion.SET_NULL,
                        related_name="completed_pm_orders",
                        to="tenancy.workshoptenant",
                    ),
                ),
                (
                    "created_by",
                    models.ForeignKey(
                        blank=True,
                        null=True,
                        on_delete=django.db.models.deletion.SET_NULL,
                        related_name="created_pm_orders",
                        to=settings.AUTH_USER_MODEL,
                    ),
                ),
                (
                    "created_by_tenant",
                    models.ForeignKey(
                        blank=True,
                        null=True,
                        on_delete=django.db.models.deletion.SET_NULL,
                        related_name="created_pm_orders",
                        to="tenancy.workshoptenant",
                    ),
                ),
                (
                    "global_vehicle",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="maintenance_orders",
                        to="global_vehicles.globalvehicle",
                    ),
                ),
            ],
            options={
                "verbose_name": "Preventive maintenance order",
                "verbose_name_plural": "Preventive maintenance orders",
                "ordering": ["-created_at"],
            },
        ),
        migrations.AddIndex(
            model_name="preventivemaintenanceorder",
            index=models.Index(fields=["global_vehicle", "status"], name="global_vehi_global__a8f2c1_idx"),
        ),
        migrations.AddIndex(
            model_name="preventivemaintenanceorder",
            index=models.Index(fields=["pm_kind", "status"], name="global_vehi_pm_kind_4b91ef_idx"),
        ),
        migrations.AddConstraint(
            model_name="preventivemaintenanceorder",
            constraint=models.UniqueConstraint(
                condition=models.Q(("status", "open")),
                fields=("global_vehicle", "pm_kind"),
                name="unique_open_pm_order_per_vehicle_kind",
            ),
        ),
    ]
