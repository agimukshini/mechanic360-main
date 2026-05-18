"""
Models for service visits, service catalog, and preventive maintenance.

We intentionally keep the main `ServiceVisit` model in `vehicles.models` and
add visit-related line items here, referencing it via string FKs to avoid
cross-app circular imports.
"""
from __future__ import annotations

import uuid

from django.db import models


class ServiceCatalogItem(models.Model):
    """
    Standard services a workshop can perform (e.g. Oil change, Brake service).

    Per-tenant isolation is handled by PostgreSQL schemas (django-tenants), so
    no explicit tenant FK is required here.
    """

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)

    name = models.CharField(max_length=255)
    description = models.TextField(blank=True)

    # Optional defaults for planning and pricing
    default_duration_hours = models.DecimalField(
        max_digits=5,
        decimal_places=2,
        default=1.0,
        help_text="Typical duration of this service in hours.",
    )
    default_price = models.DecimalField(
        max_digits=10,
        decimal_places=2,
        default=0,
        help_text="Typical base price for this service (labor only).",
    )

    is_active = models.BooleanField(default=True)

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["name"]

    def __str__(self) -> str:
        return self.name


class VisitServiceLine(models.Model):
    """
    Service line items attached to a specific visit.

    Example: "Oil & Filter Change" as part of visit #123.
    """

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)

    visit = models.ForeignKey(
        "vehicles.ServiceVisit",
        related_name="service_lines",
        on_delete=models.CASCADE,
    )
    catalog_item = models.ForeignKey(
        ServiceCatalogItem,
        related_name="visit_lines",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
    )

    description = models.CharField(
        max_length=255,
        help_text="Human-readable description shown on reports/invoices.",
    )
    quantity = models.DecimalField(max_digits=7, decimal_places=2, default=1)
    unit_price = models.DecimalField(max_digits=10, decimal_places=2, default=0)
    total_price = models.DecimalField(max_digits=10, decimal_places=2, default=0)

    class Meta:
        ordering = ["id"]

    def __str__(self) -> str:
        return f"{self.description} (visit {self.visit_id})"


class VisitMaterialLine(models.Model):
    """
    Materials/parts used during a service visit.

    These lines can later be connected to inventory stock deduction logic.
    """

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)

    visit = models.ForeignKey(
        "vehicles.ServiceVisit",
        related_name="material_lines",
        on_delete=models.CASCADE,
    )
    inventory_item = models.ForeignKey(
        "inventory.InventoryItem",
        related_name="visit_materials",
        on_delete=models.PROTECT,
    )

    quantity = models.DecimalField(max_digits=7, decimal_places=2, default=1)
    unit_price = models.DecimalField(max_digits=10, decimal_places=2, default=0)
    total_price = models.DecimalField(max_digits=10, decimal_places=2, default=0)

    class Meta:
        ordering = ["id"]

    def __str__(self) -> str:
        return f"{self.inventory_item} x {self.quantity}"


class VisitLaborLine(models.Model):
    """
    Labor entries per visit (e.g. 'Diagnosis', 'Brake pad replacement').
    """

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)

    visit = models.ForeignKey(
        "vehicles.ServiceVisit",
        related_name="labor_lines",
        on_delete=models.CASCADE,
    )

    description = models.CharField(max_length=255)
    hours = models.DecimalField(max_digits=5, decimal_places=2, default=0)
    hourly_rate = models.DecimalField(max_digits=10, decimal_places=2, default=0)
    total_price = models.DecimalField(max_digits=10, decimal_places=2, default=0)

    class Meta:
        ordering = ["id"]

    def __str__(self) -> str:
        return f"{self.description} ({self.hours}h)"


class PreventiveMaintenancePlan(models.Model):
    """
    Preventive maintenance configuration per vehicle.

    Supports:
    - km-based intervals
    - hour-based intervals
    - calendar-based intervals
    Any combination can be used; empty fields mean 'not used' for that plan.
    """

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)

    vehicle = models.ForeignKey(
        "vehicles.Vehicle",
        related_name="maintenance_plans",
        on_delete=models.CASCADE,
    )

    name = models.CharField(
        max_length=255,
        help_text="Name of the maintenance plan (e.g. 'Engine oil & filter').",
    )

    # Interval configuration
    interval_km = models.PositiveIntegerField(
        null=True,
        blank=True,
        help_text="Kilometer interval between services (leave empty if not km-based).",
    )
    interval_hours = models.PositiveIntegerField(
        null=True,
        blank=True,
        help_text="Engine hours interval between services.",
    )
    interval_days = models.PositiveIntegerField(
        null=True,
        blank=True,
        help_text="Calendar days between services.",
    )

    # Last completion data (used to calculate next due)
    last_service_date = models.DateField(null=True, blank=True)
    last_mileage_km = models.PositiveIntegerField(null=True, blank=True)
    last_hours = models.PositiveIntegerField(null=True, blank=True)

    is_active = models.BooleanField(default=True)
    notes = models.TextField(blank=True)

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["name"]

    def __str__(self) -> str:
        return f"{self.name} for {self.vehicle}"


