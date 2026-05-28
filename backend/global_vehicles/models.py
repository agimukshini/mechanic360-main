"""
Platform-wide vehicle registry (public PostgreSQL schema).

One row per VIN — visible to all workshops. Owners claim vehicles via QR tokens;
service history remains per-tenant (see working_scope/VEHICLE_SHARING_POLICY.md).
"""
from __future__ import annotations

import uuid
from datetime import timedelta

from django.conf import settings
from django.db import models
from django.utils import timezone


class GlobalVehicle(models.Model):
    """
    Canonical vehicle identity shared across all tenants.

    Operational fields (odometer, photo) may be updated by any workshop when
    servicing; changes should be audited (future).
    """

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)

    vin = models.CharField(
        max_length=64,
        unique=True,
        db_index=True,
        help_text="Immutable vehicle identity — does not change when registration plate changes.",
    )
    license_plate = models.CharField(
        max_length=32,
        db_index=True,
        help_text="Current registration plate. In XK/AL this often changes with each owner.",
    )
    make = models.CharField(max_length=64)
    model = models.CharField(max_length=64)
    year = models.PositiveIntegerField()
    engine_type = models.CharField(max_length=64, blank=True)
    fuel_type = models.CharField(max_length=32, blank=True)

    odometer_km = models.PositiveIntegerField(default=0)
    hour_meter = models.PositiveIntegerField(default=0)

    photo = models.ImageField(upload_to="global_vehicle_photos/", blank=True, null=True)
    is_active = models.BooleanField(
        default=True,
        help_text="Inactive vehicles are archived but retained for history linking.",
    )

    registered_by_tenant = models.ForeignKey(
        "tenancy.WorkshopTenant",
        related_name="registered_global_vehicles",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        help_text="Workshop that first registered this VIN in the global registry.",
    )
    registered_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        related_name="registered_global_vehicles",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
    )

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["license_plate"]
        verbose_name = "Global vehicle"
        verbose_name_plural = "Global vehicles"
        indexes = [
            models.Index(fields=["make", "model"]),
        ]

    def __str__(self) -> str:
        return f"{self.license_plate} — {self.make} {self.model} ({self.vin})"

    @property
    def current_owner(self) -> GlobalOwner | None:
        ownership = (
            self.ownerships.filter(effective_to__isnull=True)
            .select_related("owner")
            .first()
        )
        return ownership.owner if ownership else None


class GlobalOwner(models.Model):
    """
    Platform-level vehicle owner (data subject).

    Linked to a User account once the owner registers and claims vehicles.
    """

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    user = models.OneToOneField(
        settings.AUTH_USER_MODEL,
        related_name="global_owner_profile",
        on_delete=models.CASCADE,
        null=True,
        blank=True,
    )
    name = models.CharField(max_length=255)
    email = models.EmailField(db_index=True)
    phone = models.CharField(max_length=32, blank=True)

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["name"]
        verbose_name = "Global owner"
        verbose_name_plural = "Global owners"

    def __str__(self) -> str:
        return self.name


class VehicleOwnership(models.Model):
    """Links a global vehicle to an owner for a period of time."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    vehicle = models.ForeignKey(
        GlobalVehicle,
        related_name="ownerships",
        on_delete=models.CASCADE,
    )
    owner = models.ForeignKey(
        GlobalOwner,
        related_name="vehicle_ownerships",
        on_delete=models.PROTECT,
    )
    effective_from = models.DateTimeField(default=timezone.now)
    effective_to = models.DateTimeField(null=True, blank=True)
    license_plate = models.CharField(
        max_length=32,
        blank=True,
        help_text="Registration plate while this owner held the vehicle.",
    )
    claim_method = models.CharField(
        max_length=32,
        blank=True,
        help_text="How ownership was established (qr_claim, transfer, etc.).",
    )

    class Meta:
        ordering = ["-effective_from"]
        verbose_name = "Vehicle ownership"
        verbose_name_plural = "Vehicle ownerships"
        constraints = [
            models.UniqueConstraint(
                fields=["vehicle"],
                condition=models.Q(effective_to__isnull=True),
                name="unique_active_vehicle_ownership",
            ),
        ]

    def __str__(self) -> str:
        plate = self.license_plate or self.vehicle.license_plate
        end = self.effective_to.date() if self.effective_to else "present"
        return f"{plate} → {self.owner.name} ({end})"

    @property
    def is_active(self) -> bool:
        return self.effective_to is None


class VehicleClaimToken(models.Model):
    """
    Single-use QR token for owners to claim a vehicle or accept a transfer.

    QR payload format: m360:claim:{token_id}
    """

    class Purpose(models.TextChoices):
        OWNER_CLAIM = "owner_claim", "Owner claim"
        OWNERSHIP_TRANSFER = "ownership_transfer", "Ownership transfer"

    DEFAULT_TTL = timedelta(days=7)

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    vehicle = models.ForeignKey(
        GlobalVehicle,
        related_name="claim_tokens",
        on_delete=models.CASCADE,
    )
    purpose = models.CharField(max_length=32, choices=Purpose.choices)
    from_owner = models.ForeignKey(
        GlobalOwner,
        related_name="outgoing_claim_tokens",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        help_text="Current owner for ownership transfers.",
    )

    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        related_name="created_claim_tokens",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
    )
    created_by_tenant = models.ForeignKey(
        "tenancy.WorkshopTenant",
        related_name="created_claim_tokens",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
    )
    documents_verified = models.BooleanField(
        default=False,
        help_text="Mechanic confirmed identity documents for transfers.",
    )
    new_license_plate = models.CharField(
        max_length=32,
        blank=True,
        help_text="Registration plate assigned to the new owner (required for transfers in XK/AL).",
    )
    notes = models.CharField(max_length=500, blank=True)

    expires_at = models.DateTimeField()
    used_at = models.DateTimeField(null=True, blank=True)
    used_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        related_name="used_claim_tokens",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
    )

    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-created_at"]
        verbose_name = "Vehicle claim token"
        verbose_name_plural = "Vehicle claim tokens"

    def __str__(self) -> str:
        return f"{self.purpose} for {self.vehicle.license_plate}"

    @property
    def is_valid(self) -> bool:
        return self.used_at is None and self.expires_at > timezone.now()

    @property
    def qr_payload(self) -> str:
        return f"m360:claim:{self.id}"

    @classmethod
    def default_expiry(cls) -> timezone.datetime:
        return timezone.now() + cls.DEFAULT_TTL
