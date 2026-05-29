"""
Push the latest mileage / hours from each tenant's completed visits up
to the platform-wide GlobalVehicle. Idempotent — uses a max() merge so
running it twice never lowers a reading.

Run once after deploying the visit-completion sync fix to bring the
global registry in line with what the owner portal should already have
been seeing.
"""
from __future__ import annotations

from django.core.management.base import BaseCommand
from django.db import connection
from django.db.models import Max

from global_vehicles.models import GlobalVehicle
from tenancy.models import WorkshopTenant
from tenancy.views import public_schema


class Command(BaseCommand):
    help = "Backfill GlobalVehicle.odometer_km / hour_meter from latest completed visits."

    def handle(self, *args, **options):
        from vehicles.models import ServiceVisit, Vehicle

        tenants = list(WorkshopTenant.objects.exclude(schema_name="public"))
        latest_per_global: dict[str, dict[str, int]] = {}

        for tenant in tenants:
            connection.set_schema(tenant.schema_name)
            try:
                rows = (
                    ServiceVisit.objects.filter(status="completed")
                    .exclude(vehicle__global_vehicle_id__isnull=True)
                    .values("vehicle__global_vehicle_id")
                    .annotate(
                        max_km=Max("mileage_km"),
                        max_hr=Max("hour_meter"),
                    )
                )
                for row in rows:
                    gid = str(row["vehicle__global_vehicle_id"])
                    bucket = latest_per_global.setdefault(gid, {"km": 0, "hr": 0})
                    bucket["km"] = max(bucket["km"], row["max_km"] or 0)
                    bucket["hr"] = max(bucket["hr"], row["max_hr"] or 0)
                # Also fold in the local Vehicle.odometer_km so manually-entered
                # values win against an empty visit history.
                vehicle_rows = (
                    Vehicle.objects.exclude(global_vehicle_id__isnull=True)
                    .values("global_vehicle_id", "odometer_km", "hour_meter")
                )
                for vrow in vehicle_rows:
                    gid = str(vrow["global_vehicle_id"])
                    bucket = latest_per_global.setdefault(gid, {"km": 0, "hr": 0})
                    bucket["km"] = max(bucket["km"], vrow["odometer_km"] or 0)
                    bucket["hr"] = max(bucket["hr"], vrow["hour_meter"] or 0)
            except Exception as exc:
                self.stderr.write(f"Skipping {tenant.schema_name}: {exc}")
            finally:
                connection.set_schema("public")

        if not latest_per_global:
            self.stdout.write("Nothing to backfill.")
            return

        bumped = 0
        with public_schema():
            for gid, latest in latest_per_global.items():
                try:
                    gv = GlobalVehicle.objects.get(id=gid)
                except (GlobalVehicle.DoesNotExist, ValueError):
                    continue
                update_fields: list[str] = []
                if latest["km"] > (gv.odometer_km or 0):
                    gv.odometer_km = latest["km"]
                    update_fields.append("odometer_km")
                if latest["hr"] > (gv.hour_meter or 0):
                    gv.hour_meter = latest["hr"]
                    update_fields.append("hour_meter")
                if update_fields:
                    update_fields.append("updated_at")
                    gv.save(update_fields=update_fields)
                    bumped += 1

        self.stdout.write(self.style.SUCCESS(f"Bumped {bumped} GlobalVehicle rows."))
