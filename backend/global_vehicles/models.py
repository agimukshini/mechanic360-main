"""
Platform-wide vehicle registry (public PostgreSQL schema).

One row per VIN — visible to all workshops. Owners claim vehicles via QR tokens;
service history remains per-tenant (see working_scope/VEHICLE_SHARING_POLICY.md).
"""
from __future__ import annotations

import uuid
from datetime import timedelta
from decimal import Decimal

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
        """
        Return the active ownership owner.

        Honours `prefetch_related("ownerships__owner")` — important because
        callers fetch this object inside a `public_schema()` context but
        access the property later from a tenant context. Without the cache
        check, `.filter()` triggers a fresh query in the wrong schema and
        silently returns nothing.
        """
        cache = getattr(self, "_prefetched_objects_cache", None) or {}
        if "ownerships" in cache:
            for o in cache["ownerships"]:
                if o.effective_to is None:
                    return o.owner
            return None
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


# =============================================================================
# Cross-tenant audit log — every vehicle / ownership / photo mutation
# =============================================================================


class VehicleAuditEvent(models.Model):
    """
    Cross-tenant audit log for everything that happens to a vehicle.

    Lives in the public schema so the platform superadmin can query *every*
    workshop in one go. Tenant rows live in other schemas, so we don't use
    real ForeignKeys — we snapshot the schema name, the tenant row UUID, and
    enough actor metadata to investigate disputes long after the source rows
    have been changed or deleted.

    This is the single source of truth for:
      - Vehicle CRUD (create / update / delete / archive / restore)
      - Ownership changes (transfer, claim, cancel, dispute, reverse)
      - Registration plate updates
      - Mechanic assignment changes
      - Photo gallery CRUD (future)
      - Transfer billing status transitions
    """

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)

    # --- Cross-tenant pointers (no FK — rows live in other schemas) -----------
    tenant_schema = models.CharField(max_length=63, db_index=True)
    tenant_name = models.CharField(max_length=255, blank=True)
    vehicle_tenant_id = models.UUIDField(null=True, blank=True, db_index=True)
    global_vehicle_id = models.UUIDField(null=True, blank=True, db_index=True)

    class Entity(models.TextChoices):
        VEHICLE = "vehicle", "Vehicle"
        OWNERSHIP = "ownership", "Ownership"
        REGISTRATION = "registration", "Registration"
        PHOTO = "photo", "Photo"
        ASSIGNMENT = "assignment", "Assignment"
        ARCHIVE = "archive", "Archive"
        BILLING = "billing", "Billing"

    class Action(models.TextChoices):
        CREATED = "created", "Created"
        UPDATED = "updated", "Updated"
        DELETED = "deleted", "Deleted"
        ARCHIVED = "archived", "Archived"
        RESTORED = "restored", "Restored"
        TRANSFER_INITIATED = "transfer_initiated", "Transfer initiated"
        TRANSFER_CONFIRMED = "transfer_confirmed", "Transfer confirmed"
        TRANSFER_CANCELLED = "transfer_cancelled", "Transfer cancelled"
        TRANSFER_EXPIRED = "transfer_expired", "Transfer expired"
        TRANSFER_DISPUTED = "transfer_disputed", "Transfer disputed"
        TRANSFER_REVERSED = "transfer_reversed", "Transfer reversed"
        CLAIMED = "claimed", "Owner claimed"
        BILLING_CHANGED = "billing_changed", "Billing changed"

    entity = models.CharField(
        max_length=16, choices=Entity.choices, db_index=True,
    )
    action = models.CharField(
        max_length=24, choices=Action.choices, db_index=True,
    )

    # Pointer to the sub-row this event is about (photo id, transfer id,
    # ownership id, claim token id, …). Stored as a CharField rather than
    # a UUID so we never have to coerce one of those flexibly-sourced IDs.
    target_id = models.CharField(max_length=64, blank=True, db_index=True)

    # --- Actor metadata -------------------------------------------------------
    actor_user_id = models.UUIDField(null=True, blank=True)
    actor_username = models.CharField(max_length=150, blank=True)
    actor_role = models.CharField(max_length=32, blank=True)
    request_ip = models.GenericIPAddressField(null=True, blank=True)
    request_user_agent = models.CharField(max_length=512, blank=True)

    # --- Diff -----------------------------------------------------------------
    # Map of {field: {"before": ..., "after": ...}}. The helper compares
    # before/after and short-circuits when this is empty (no noise rows).
    changes = models.JSONField(default=dict, blank=True)

    # Free-form note for actions with no obvious diff
    # (e.g. "transferred via QR token <id>").
    note = models.CharField(max_length=512, blank=True)

    occurred_at = models.DateTimeField(auto_now_add=True, db_index=True)

    class Meta:
        ordering = ["-occurred_at"]
        verbose_name = "Vehicle audit event"
        verbose_name_plural = "Vehicle audit events"
        indexes = [
            models.Index(fields=["tenant_schema", "vehicle_tenant_id"]),
            models.Index(fields=["global_vehicle_id", "occurred_at"]),
            models.Index(fields=["entity", "action"]),
        ]

    def __str__(self) -> str:
        return f"{self.entity}/{self.action} @{self.tenant_schema} [{self.occurred_at:%Y-%m-%d %H:%M}]"


# =============================================================================
# Ownership transfer lifecycle
# =============================================================================


class OwnershipTransfer(models.Model):
    """
    First-class ownership transfer entity.

    Wraps the existing `VehicleClaimToken` (the QR token) with explicit
    lifecycle, billing, fraud / dispute tracking, and IP / device metadata.
    Survives the underlying token (rows here are never deleted) so disputes
    investigated months later still have a complete record.
    """

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)

    vehicle = models.ForeignKey(
        GlobalVehicle,
        related_name="transfers",
        on_delete=models.PROTECT,
    )

    from_owner = models.ForeignKey(
        GlobalOwner,
        null=True,
        blank=True,
        related_name="outgoing_transfers",
        on_delete=models.SET_NULL,
        help_text="May be null for a first-time claim of an unclaimed vehicle.",
    )
    to_owner = models.ForeignKey(
        GlobalOwner,
        null=True,
        blank=True,
        related_name="incoming_transfers",
        on_delete=models.SET_NULL,
        help_text="Null until the receiving owner confirms via QR.",
    )

    # --- Initiator ------------------------------------------------------------
    initiated_by_tenant = models.ForeignKey(
        "tenancy.WorkshopTenant",
        related_name="initiated_transfers",
        on_delete=models.PROTECT,
    )
    initiated_by_user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        related_name="initiated_transfers",
        on_delete=models.PROTECT,
    )
    initiated_at = models.DateTimeField(auto_now_add=True)
    initiated_ip = models.GenericIPAddressField(null=True, blank=True)
    initiated_user_agent = models.CharField(max_length=512, blank=True)

    # --- QR confirmation ------------------------------------------------------
    claim_token = models.OneToOneField(
        VehicleClaimToken,
        related_name="transfer",
        on_delete=models.PROTECT,
    )
    confirmed_at = models.DateTimeField(null=True, blank=True)
    confirmed_by_user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        null=True,
        blank=True,
        related_name="confirmed_transfers",
        on_delete=models.SET_NULL,
    )
    confirmed_ip = models.GenericIPAddressField(null=True, blank=True)
    confirmed_user_agent = models.CharField(max_length=512, blank=True)

    # --- Lifecycle ------------------------------------------------------------
    class Status(models.TextChoices):
        PENDING = "pending", "Pending QR confirmation"
        CONFIRMED = "confirmed", "Confirmed"
        EXPIRED = "expired", "Expired before confirmation"
        CANCELLED = "cancelled", "Cancelled by initiator"
        DISPUTED = "disputed", "Disputed (frozen for review)"
        REVERSED = "reversed", "Reversed by platform superadmin"

    status = models.CharField(
        max_length=16,
        choices=Status.choices,
        default=Status.PENDING,
        db_index=True,
    )

    # Notes the initiator wrote (visible to workshop, owner, superadmin).
    initiator_notes = models.TextField(blank=True)
    # Notes the superadmin wrote when disputing / reversing.
    # Mechanics and owners can NEVER read or write this field.
    superadmin_notes = models.TextField(blank=True)

    documents_verified = models.BooleanField(default=False)
    new_license_plate = models.CharField(max_length=32, blank=True)

    # When `status == REVERSED`, this points back at the transfer the
    # superadmin reverted. We never destroy history — reversals append.
    reversed_transfer = models.ForeignKey(
        "self",
        null=True,
        blank=True,
        related_name="reversals",
        on_delete=models.SET_NULL,
    )

    class Meta:
        ordering = ["-initiated_at"]
        verbose_name = "Ownership transfer"
        verbose_name_plural = "Ownership transfers"
        indexes = [
            models.Index(fields=["vehicle", "-initiated_at"]),
            models.Index(fields=["from_owner", "to_owner"]),
            models.Index(fields=["status", "initiated_at"]),
        ]

    def __str__(self) -> str:
        plate = self.vehicle.license_plate if self.vehicle_id else "?"
        return f"Transfer {plate} ({self.status}) — {self.initiated_at:%Y-%m-%d}"

    @property
    def is_terminal(self) -> bool:
        return self.status in {
            self.Status.CONFIRMED,
            self.Status.EXPIRED,
            self.Status.CANCELLED,
            self.Status.REVERSED,
        }


class TransferBilling(models.Model):
    """
    Captures the platform fee for one ownership transfer.

    Once created, `fee_amount` is immutable — new fee means a new transfer.
    Only superadmin endpoints may change `payment_status`.
    """

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    transfer = models.OneToOneField(
        OwnershipTransfer,
        related_name="billing",
        on_delete=models.PROTECT,
    )

    fee_amount = models.DecimalField(max_digits=10, decimal_places=2)
    fee_currency = models.CharField(max_length=3, default="EUR")

    class PaymentStatus(models.TextChoices):
        UNPAID = "unpaid", "Unpaid"
        PROCESSING = "processing", "Processing"
        PAID = "paid", "Paid"
        REFUNDED = "refunded", "Refunded"
        WAIVED = "waived", "Waived (superadmin)"

    payment_status = models.CharField(
        max_length=16,
        choices=PaymentStatus.choices,
        default=PaymentStatus.UNPAID,
    )

    invoice_reference = models.CharField(max_length=64, blank=True)
    paid_at = models.DateTimeField(null=True, blank=True)
    captured_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="captured_transfer_fees",
    )

    # Frozen audit copy of the price list at charging time. Survives a
    # later price-list change so historical fees stay meaningful.
    snapshot = models.JSONField(default=dict, blank=True)

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name = "Transfer billing"
        verbose_name_plural = "Transfer billings"

    def __str__(self) -> str:
        return f"{self.fee_amount} {self.fee_currency} — {self.payment_status}"


# =============================================================================
# Platform pricing — single config row read by the transfer initiator
# =============================================================================


class PlatformPricing(models.Model):
    """
    Singleton-ish config: the current fee charged for an ownership transfer.

    Future: split per-tenant, per-country, per-vehicle-class. For now we keep
    one row and use `.objects.first()`. Each `TransferBilling.snapshot` freezes
    these values at charging time so changing this row doesn't rewrite history.
    """

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)

    transfer_fee_amount = models.DecimalField(
        max_digits=10,
        decimal_places=2,
        default=Decimal("0.00"),
    )
    transfer_fee_currency = models.CharField(max_length=3, default="EUR")

    updated_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
    )
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name = "Platform pricing"
        verbose_name_plural = "Platform pricing"

    def __str__(self) -> str:
        return f"Transfer fee: {self.transfer_fee_amount} {self.transfer_fee_currency}"

    def snapshot(self) -> dict:
        return {
            "transfer_fee_amount": str(self.transfer_fee_amount),
            "transfer_fee_currency": self.transfer_fee_currency,
            "captured_at": timezone.now().isoformat(),
        }

    @classmethod
    def current(cls) -> "PlatformPricing":
        row = cls.objects.first()
        if row is None:
            row = cls.objects.create()
        return row
