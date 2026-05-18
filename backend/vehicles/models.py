"""
Core domain models: Vehicle, ServiceVisit, Inspection.

These map directly to the entities and workflows described in `working_scope.md`
and the Jira epics (Vehicle Management API, etc.).

All primary keys are UUIDs instead of numeric IDs.

Note: Client model has been moved to clients.models and InventoryItem to 
inventory.models to match the app structure.
"""
from __future__ import annotations

import uuid

from django.conf import settings
from django.db import models

from clients.models import Client


class Vehicle(models.Model):
    """
    Vehicle registry entry.

    - VIN is unique and used as the canonical ID
    - A QR code is generated from the VIN in the frontend or via a helper API
    """

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)

    owner = models.ForeignKey(Client, related_name="vehicles", on_delete=models.PROTECT)
    vin = models.CharField(max_length=64, unique=True)
    license_plate = models.CharField(max_length=32)
    make = models.CharField(max_length=64)
    model = models.CharField(max_length=64)
    year = models.PositiveIntegerField()
    engine_type = models.CharField(max_length=64, blank=True)
    fuel_type = models.CharField(max_length=32, blank=True)

    # Latest readings (history stored in a separate model if needed)
    odometer_km = models.PositiveIntegerField(default=0)
    hour_meter = models.PositiveIntegerField(default=0)

    photo = models.ImageField(upload_to="vehicle_photos/", blank=True, null=True)
    is_active = models.BooleanField(
        default=True,
        help_text="Inactive vehicles are archived and hidden from default lists.",
    )

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["license_plate"]

    def __str__(self) -> str:
        return f"{self.license_plate} - {self.make} {self.model}"


class ServiceVisit(models.Model):
    """
    One maintenance visit for a vehicle.

    This ties together:
    - 360° inspection
    - Services performed
    - Materials used (via related models)
    """

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)

    class Status(models.TextChoices):
        DRAFT = "draft", "Draft"
        IN_PROGRESS = "in_progress", "In Progress"
        COMPLETED = "completed", "Completed"
        CANCELLED = "cancelled", "Cancelled"

    vehicle = models.ForeignKey(Vehicle, related_name="visits", on_delete=models.PROTECT)
    client = models.ForeignKey(Client, related_name="visits", on_delete=models.PROTECT)
    status = models.CharField(max_length=32, choices=Status.choices, default=Status.DRAFT)
    mileage_km = models.PositiveIntegerField(default=0)
    hour_meter = models.PositiveIntegerField(default=0)

    service_date = models.DateTimeField()
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        related_name="created_visits",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
    )

    notes = models.TextField(blank=True)

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-service_date"]

    def __str__(self) -> str:
        return f"Visit #{self.pk} for {self.vehicle}"


class Inspection(models.Model):
    """
    360° technical inspection performed during a visit.

    For simplicity we store a JSON blob with section results; this can be
    expanded into normalized tables later if needed.
    """

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)

    visit = models.OneToOneField(ServiceVisit, related_name="inspection", on_delete=models.CASCADE)
    performed_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        related_name="inspections",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
    )
    performed_at = models.DateTimeField(auto_now_add=True)

    # JSON field for the structured checklist (sections, items, values)
    data = models.JSONField(
        help_text="Structured results for the 360° checklist (per section and item).",
    )

    class Meta:
        ordering = ["-performed_at"]

    def __str__(self) -> str:
        return f"Inspection for {self.visit}"


class VehicleDocument(models.Model):
    """
    Documents attached to a vehicle (service records, receipts, photos, etc.).
    """

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)

    vehicle = models.ForeignKey(Vehicle, related_name="documents", on_delete=models.CASCADE)
    file = models.FileField(upload_to="vehicle_documents/")
    name = models.CharField(max_length=255, blank=True)
    uploaded_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        related_name="uploaded_documents",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
    )
    uploaded_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-uploaded_at"]

    def __str__(self) -> str:
        return f"{self.name or self.file.name} for {self.vehicle}"

    def save(self, *args, **kwargs):
        if not self.name and self.file:
            self.name = self.file.name
        super().save(*args, **kwargs)


