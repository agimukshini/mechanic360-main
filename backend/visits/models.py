"""
Models for service visits, service catalog, and preventive maintenance.

We intentionally keep the main `ServiceVisit` model in `vehicles.models` and
add visit-related line items here, referencing it via string FKs to avoid
cross-app circular imports.
"""
from __future__ import annotations

import uuid

from django.conf import settings
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
    name_sq = models.CharField(max_length=255, blank=True, default="")
    description_sq = models.TextField(blank=True, default="")

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

    pm_kind = models.CharField(
        max_length=32,
        blank=True,
        default="",
        help_text="When set, this catalog service counts toward preventive maintenance offers.",
    )
    is_pm_closure = models.BooleanField(
        default=False,
        help_text=(
            "When true, adding this catalog line to a visit closes the matching open PM "
            "order on finish. Closure lines are always priced at zero."
        ),
    )

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

    performed_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        related_name="service_lines_performed",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        help_text="Mechanic who performed this service line.",
    )

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

    performed_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        related_name="labor_lines_performed",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        help_text="Mechanic who performed this labor line.",
    )

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
    - seasonal windows (e.g. winter / summer tire change by month-day)
    Any combination can be used for interval mode; empty fields mean 'not used'.
    """

    class ScheduleMode(models.TextChoices):
        INTERVAL = "interval", "Interval (km / days / hours)"
        SEASONAL = "seasonal", "Seasonal (month-day window)"

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

    schedule_mode = models.CharField(
        max_length=16,
        choices=ScheduleMode.choices,
        default=ScheduleMode.INTERVAL,
        help_text="Interval counters or fixed seasonal month-day windows.",
    )

    # Seasonal configuration (tire change: winter period start/end)
    season_start_month = models.PositiveSmallIntegerField(
        null=True,
        blank=True,
        help_text="Month when the seasonal period starts (1–12), e.g. 11 for November.",
    )
    season_start_day = models.PositiveSmallIntegerField(
        null=True,
        blank=True,
        help_text="Day when the seasonal period starts (1–31).",
    )
    season_end_month = models.PositiveSmallIntegerField(
        null=True,
        blank=True,
        help_text="Month when the seasonal period ends (1–12), e.g. 4 for April.",
    )
    season_end_day = models.PositiveSmallIntegerField(
        null=True,
        blank=True,
        help_text="Last day of the seasonal period (1–31).",
    )
    reminder_days_before = models.PositiveSmallIntegerField(
        default=14,
        help_text="How many days before the target date to start reminders.",
    )

    # Last completion data (used to calculate next due)
    last_service_date = models.DateField(null=True, blank=True)
    last_mileage_km = models.PositiveIntegerField(null=True, blank=True)
    last_hours = models.PositiveIntegerField(null=True, blank=True)

    is_active = models.BooleanField(default=True)
    notes = models.TextField(blank=True)

    pm_kind = models.CharField(
        max_length=32,
        blank=True,
        default="regular_service",
        help_text="Type of PM work order to publish when this plan is due.",
    )

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["name"]

    def __str__(self) -> str:
        return f"{self.name} for {self.vehicle}"


