"""
For every tenant, create local Client mirrors for any GlobalOwner attached
to a vehicle that has visited this workshop. Idempotent — safe to run any
time. Used to populate /clients with platform owners that pre-date the
auto-mirror logic on visit / adopt.
"""
from __future__ import annotations

from django.core.management.base import BaseCommand
from django.db import connection

from global_vehicles.models import GlobalVehicle
from tenancy.models import WorkshopTenant
from tenancy.views import public_schema


class Command(BaseCommand):
    help = "Backfill local Client mirrors of GlobalOwner across all tenants."

    def handle(self, *args, **options):
        from clients.services import ensure_client_for_global_owner
        from vehicles.models import Vehicle  # imported lazily — tenant app

        tenants = list(WorkshopTenant.objects.exclude(schema_name="public"))
        total_created = 0
        total_linked = 0

        for tenant in tenants:
            connection.set_schema(tenant.schema_name)
            try:
                local_vehicles = list(
                    Vehicle.objects.exclude(global_vehicle_id__isnull=True)
                )
                global_ids = {v.global_vehicle_id for v in local_vehicles if v.global_vehicle_id}
            except Exception as exc:  # pragma: no cover — defensive
                self.stderr.write(f"Skipping {tenant.schema_name}: {exc}")
                continue

            if not global_ids:
                continue

            with public_schema():
                global_map = {
                    gv.id: gv
                    for gv in GlobalVehicle.objects.filter(id__in=global_ids).prefetch_related(
                        "ownerships__owner",
                    )
                }

            connection.set_schema(tenant.schema_name)
            for vehicle in local_vehicles:
                gv = global_map.get(vehicle.global_vehicle_id)
                if gv is None:
                    continue
                with public_schema():
                    owner = gv.current_owner
                if owner is None:
                    continue

                client_before = vehicle.owner_id
                client = ensure_client_for_global_owner(owner)
                if client is None:
                    continue
                if client_before is None:
                    total_created += 1
                if vehicle.owner_id != client.id:
                    vehicle.owner = client
                    vehicle.save(update_fields=["owner", "updated_at"])
                    total_linked += 1

        connection.set_schema("public")
        self.stdout.write(
            self.style.SUCCESS(
                f"Backfill complete. Mirrored {total_created} new clients; "
                f"linked {total_linked} vehicles to owners.",
            ),
        )
