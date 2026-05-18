"""
Delete all service visits and related data (inspections, line items) per tenant schema.

Inventory stock used on material lines is restored via post_delete signals.

Usage:
    python manage.py reset_visits
    python manage.py reset_visits --schema=demo_workshop
"""
from __future__ import annotations

from django.core.management.base import BaseCommand
from django.db import transaction
from django_tenants.utils import get_tenant_model, schema_context

from vehicles.models import Inspection, ServiceVisit
from visits.models import VisitLaborLine, VisitMaterialLine, VisitServiceLine


class Command(BaseCommand):
    help = "Delete all service visits (and inspections / line items) for fresh testing."

    def add_arguments(self, parser):
        parser.add_argument(
            "--schema",
            type=str,
            help="Only reset this tenant schema (default: all tenant schemas).",
        )
        parser.add_argument(
            "--noinput",
            action="store_true",
            help="Skip confirmation prompt.",
        )

    def handle(self, *args, **options):
        Tenant = get_tenant_model()
        schema_filter = options.get("schema")
        tenants = Tenant.objects.all()
        if schema_filter:
            tenants = tenants.filter(schema_name=schema_filter)
            if not tenants.exists():
                self.stderr.write(self.style.ERROR(f"No tenant with schema '{schema_filter}'."))
                return

        if not options["noinput"]:
            names = ", ".join(t.schema_name for t in tenants)
            confirm = input(f"Delete ALL visits in schema(s): {names}? Type 'yes': ")
            if confirm.strip().lower() != "yes":
                self.stdout.write("Aborted.")
                return

        grand_total = 0
        for tenant in tenants:
            if tenant.schema_name == "public":
                continue
            with schema_context(tenant.schema_name):
                counts = self._counts()
                total = counts["visits"]
                if total == 0:
                    self.stdout.write(f"  {tenant.schema_name}: no visits")
                    continue
                with transaction.atomic():
                    ServiceVisit.objects.all().delete()
                grand_total += total
                self.stdout.write(
                    self.style.SUCCESS(
                        f"  {tenant.schema_name}: removed {counts['visits']} visit(s) "
                        f"({counts['inspections']} inspections, "
                        f"{counts['service_lines']} service lines, "
                        f"{counts['material_lines']} material lines, "
                        f"{counts['labor_lines']} labor lines)"
                    )
                )

        self.stdout.write(self.style.SUCCESS(f"Done. {grand_total} visit(s) removed in total."))

    def _counts(self) -> dict[str, int]:
        return {
            "visits": ServiceVisit.objects.count(),
            "inspections": Inspection.objects.count(),
            "service_lines": VisitServiceLine.objects.count(),
            "material_lines": VisitMaterialLine.objects.count(),
            "labor_lines": VisitLaborLine.objects.count(),
        }
