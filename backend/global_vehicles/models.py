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

from .pm_kinds import PMKind


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
# Per-tenant platform billing — what the PLATFORM charges this workshop
# =============================================================================
#
# Separate from the workshop's own pricing for their customers (service
# catalog / parts). This is strictly the platform → tenant relationship:
#
#   • Per-transfer fee (charged on every ownership transfer)
#   • Per-vehicle-registration fee (charged when a global vehicle is created)
#   • Subscription plan + recurring fee
#
# `TransferBilling.snapshot` / `VehicleRegistrationCharge.snapshot` freeze
# the config at charge time so changing rates here never rewrites history.
# =============================================================================


class TenantPlatformBilling(models.Model):
    """
    Per-tenant fee configuration for what the PLATFORM charges this workshop.

    Lives in the public schema so the superadmin reads/writes it once. Each
    `TransferBilling` / `VehicleRegistrationCharge` snapshot freezes the
    amounts at charge time — changing this row never rewrites history.
    """

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    tenant = models.OneToOneField(
        "tenancy.WorkshopTenant",
        related_name="platform_billing",
        on_delete=models.CASCADE,
    )

    # --- Per-event fees ------------------------------------------------------
    transfer_fee_amount = models.DecimalField(
        max_digits=10,
        decimal_places=2,
        default=Decimal("0.00"),
        help_text="Charged on every confirmed ownership transfer.",
    )
    transfer_fee_currency = models.CharField(max_length=3, default="EUR")

    registration_fee_amount = models.DecimalField(
        max_digits=10,
        decimal_places=2,
        default=Decimal("0.00"),
        help_text="Charged when a new vehicle is added to the global registry.",
    )
    registration_fee_currency = models.CharField(max_length=3, default="EUR")

    # --- Subscription -------------------------------------------------------
    class SubscriptionPeriod(models.TextChoices):
        NONE = "none", "No subscription"
        MONTHLY = "monthly", "Monthly"
        YEARLY = "yearly", "Yearly"

    subscription_fee_amount = models.DecimalField(
        max_digits=10,
        decimal_places=2,
        default=Decimal("0.00"),
    )
    subscription_fee_currency = models.CharField(max_length=3, default="EUR")
    subscription_period = models.CharField(
        max_length=16,
        choices=SubscriptionPeriod.choices,
        default=SubscriptionPeriod.NONE,
    )
    subscription_next_charge_at = models.DateTimeField(
        null=True,
        blank=True,
        help_text="When the next subscription invoice is due. Set by the billing cron.",
    )

    # Superadmin-only commentary (e.g. "free for first 6 months — pilot").
    notes = models.TextField(blank=True)

    updated_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name = "Tenant platform billing"
        verbose_name_plural = "Tenant platform billing"

    def __str__(self) -> str:
        return (
            f"{self.tenant.name if self.tenant_id else '?'} — "
            f"transfer:{self.transfer_fee_amount} reg:{self.registration_fee_amount} "
            f"sub:{self.subscription_fee_amount}/{self.subscription_period}"
        )

    def transfer_snapshot(self) -> dict:
        return {
            "kind": "transfer",
            "amount": str(self.transfer_fee_amount),
            "currency": self.transfer_fee_currency,
            "tenant_id": str(self.tenant_id),
            "tenant_name": self.tenant.name if self.tenant_id else "",
            "captured_at": timezone.now().isoformat(),
        }

    def registration_snapshot(self) -> dict:
        return {
            "kind": "registration",
            "amount": str(self.registration_fee_amount),
            "currency": self.registration_fee_currency,
            "tenant_id": str(self.tenant_id),
            "tenant_name": self.tenant.name if self.tenant_id else "",
            "captured_at": timezone.now().isoformat(),
        }

    @classmethod
    def for_tenant(cls, tenant) -> "TenantPlatformBilling":
        """Return (or create on the fly) the billing row for a tenant."""
        row, _ = cls.objects.get_or_create(tenant=tenant)
        return row


class VehicleRegistrationCharge(models.Model):
    """
    A single platform-billing line item for adding a vehicle to the global
    registry.

    Created the first time a tenant calls `sync_vehicle_to_global` for a VIN.
    `snapshot` freezes the per-tenant fee config so changing rates later
    never rewrites history.
    """

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    vehicle = models.OneToOneField(
        GlobalVehicle,
        related_name="registration_charge",
        on_delete=models.PROTECT,
    )
    tenant = models.ForeignKey(
        "tenancy.WorkshopTenant",
        related_name="registration_charges",
        on_delete=models.PROTECT,
    )
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
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

    snapshot = models.JSONField(default=dict, blank=True)

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name = "Vehicle registration charge"
        verbose_name_plural = "Vehicle registration charges"
        indexes = [
            models.Index(fields=["tenant", "-created_at"]),
            models.Index(fields=["payment_status"]),
        ]

    def __str__(self) -> str:
        return f"Reg charge {self.fee_amount} {self.fee_currency} — {self.payment_status}"


class PlatformInvoice(models.Model):
    """
    Unified platform → tenant invoice.

    Subscription invoices are issued by the billing cron (or manually by
    superadmin). Transfer / registration rows may link here in a later phase;
    v1 focuses on recurring subscription billing.
    """

    class Kind(models.TextChoices):
        SUBSCRIPTION = "subscription", "Subscription"
        TRANSFER = "transfer", "Ownership transfer"
        REGISTRATION = "registration", "Vehicle registration"
        MANUAL = "manual", "Manual"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    invoice_number = models.CharField(max_length=32, unique=True, db_index=True)
    tenant = models.ForeignKey(
        "tenancy.WorkshopTenant",
        related_name="platform_invoices",
        on_delete=models.PROTECT,
    )
    kind = models.CharField(max_length=16, choices=Kind.choices)

    amount = models.DecimalField(max_digits=10, decimal_places=2)
    currency = models.CharField(max_length=3, default="EUR")

    payment_status = models.CharField(
        max_length=16,
        choices=TransferBilling.PaymentStatus.choices,
        default=TransferBilling.PaymentStatus.UNPAID,
    )
    invoice_reference = models.CharField(
        max_length=64,
        blank=True,
        help_text="External payment reference (bank transfer id, Stripe invoice, etc.).",
    )
    paid_at = models.DateTimeField(null=True, blank=True)
    captured_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="captured_platform_invoices",
    )

    period_start = models.DateTimeField(null=True, blank=True)
    period_end = models.DateTimeField(null=True, blank=True)
    due_at = models.DateTimeField(null=True, blank=True)
    issued_at = models.DateTimeField(default=timezone.now)

    line_items = models.JSONField(default=list, blank=True)
    snapshot = models.JSONField(default=dict, blank=True)
    notes = models.TextField(blank=True)

    related_transfer = models.OneToOneField(
        TransferBilling,
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="platform_invoice",
    )
    related_registration_charge = models.OneToOneField(
        VehicleRegistrationCharge,
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="platform_invoice",
    )

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name = "Platform invoice"
        verbose_name_plural = "Platform invoices"
        ordering = ["-issued_at"]
        indexes = [
            models.Index(fields=["tenant", "-issued_at"]),
            models.Index(fields=["payment_status"]),
            models.Index(fields=["kind"]),
        ]

    def __str__(self) -> str:
        return f"{self.invoice_number} — {self.amount} {self.currency} ({self.payment_status})"


class PlatformInvoiceReminder(models.Model):
    """Tracks which billing reminders were sent for one invoice (idempotent daily job)."""

    class Kind(models.TextChoices):
        INVOICE_ISSUED = "invoice_issued", "Invoice issued"
        DUE_7D = "due_7d", "7 days before due"
        DUE_1D = "due_1d", "1 day before due"
        PERIOD_END_7D = "period_end_7d", "7 days before period end"
        PERIOD_END_1D = "period_end_1d", "1 day before period end"
        OVERDUE_FINAL = "overdue_final", "Final overdue warning"
        TENANT_DEACTIVATED = "tenant_deactivated", "Tenant deactivated"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    invoice = models.ForeignKey(
        PlatformInvoice,
        related_name="reminders",
        on_delete=models.CASCADE,
    )
    kind = models.CharField(max_length=32, choices=Kind.choices)
    sent_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        constraints = [
            models.UniqueConstraint(
                fields=["invoice", "kind"],
                name="unique_platform_invoice_reminder",
            ),
        ]

    def __str__(self) -> str:
        return f"{self.invoice.invoice_number} — {self.kind}"


class GlobalVehiclePhoto(models.Model):
    """
    Cross-tenant gallery photo for a vehicle.

    Lives in the public schema so any workshop opening the same VIN sees the
    same set of pictures. The owning workshop (the tenant whose user uploaded
    the photo) is recorded for audit / edit-permission purposes — the spec
    (`VEHICLE_SHARING_POLICY.md` §2.1) says photos are operational data on
    the global vehicle, not part of a specific shop's history. Visit and
    inspection rows stay tenant-scoped; only the picture is shared.
    """

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    vehicle = models.ForeignKey(
        GlobalVehicle,
        related_name="gallery_photos",
        on_delete=models.CASCADE,
    )
    image = models.ImageField(upload_to="vehicle_photos/")
    caption = models.CharField(max_length=255, blank=True)
    sort_order = models.PositiveIntegerField(default=0)

    uploaded_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        related_name="uploaded_global_vehicle_photos",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
    )
    uploaded_by_tenant = models.ForeignKey(
        "tenancy.WorkshopTenant",
        related_name="uploaded_vehicle_photos",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        help_text="Workshop that posted the photo. Used to gate edits / deletes.",
    )

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["sort_order", "-created_at"]
        verbose_name = "Global vehicle photo"
        verbose_name_plural = "Global vehicle photos"
        indexes = [
            models.Index(fields=["vehicle", "sort_order"]),
            models.Index(fields=["uploaded_by_tenant"]),
        ]

    def __str__(self) -> str:
        return f"Photo for {self.vehicle.vin} ({self.id})"


class PreventiveMaintenanceOrder(models.Model):
    """
    Cross-tenant preventive maintenance work order for a global vehicle.

    Visible to the vehicle owner and to workshops that (a) have this vehicle
    in their local registry and (b) offer the matching service type in their
    catalog (`ServiceCatalogItem.pm_kind`).
    """

    class Status(models.TextChoices):
        OPEN = "open", "Open"
        COMPLETED = "completed", "Completed"
        CANCELLED = "cancelled", "Cancelled"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)

    global_vehicle = models.ForeignKey(
        GlobalVehicle,
        related_name="maintenance_orders",
        on_delete=models.CASCADE,
    )

    pm_kind = models.CharField(max_length=32, choices=PMKind.choices, db_index=True)

    status = models.CharField(
        max_length=16,
        choices=Status.choices,
        default=Status.OPEN,
        db_index=True,
    )

    due_date = models.DateField(null=True, blank=True)
    due_odometer_km = models.PositiveIntegerField(null=True, blank=True)

    title = models.CharField(max_length=255, blank=True)
    notes = models.TextField(blank=True)

    created_by_tenant = models.ForeignKey(
        "tenancy.WorkshopTenant",
        related_name="created_pm_orders",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
    )
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        related_name="created_pm_orders",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
    )

    # Reference to tenant-scoped PreventiveMaintenancePlan.id (no cross-schema FK).
    source_plan_id = models.UUIDField(null=True, blank=True, db_index=True)

    completed_at = models.DateTimeField(null=True, blank=True)
    completed_by_tenant = models.ForeignKey(
        "tenancy.WorkshopTenant",
        related_name="completed_pm_orders",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
    )

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-created_at"]
        verbose_name = "Preventive maintenance order"
        verbose_name_plural = "Preventive maintenance orders"
        indexes = [
            models.Index(
                fields=["global_vehicle", "status"],
                name="global_vehi_global__a8f2c1_idx",
            ),
            models.Index(
                fields=["pm_kind", "status"],
                name="global_vehi_pm_kind_4b91ef_idx",
            ),
        ]
        constraints = [
            models.UniqueConstraint(
                fields=["global_vehicle", "pm_kind"],
                condition=models.Q(status="open"),
                name="unique_open_pm_order_per_vehicle_kind",
            ),
        ]

    def __str__(self) -> str:
        return f"{self.get_pm_kind_display()} — {self.global_vehicle.license_plate} ({self.status})"

    def save(self, *args, **kwargs):
        if not self.title:
            self.title = self.get_pm_kind_display()
        super().save(*args, **kwargs)

