"""
Lifecycle business logic for `OwnershipTransfer`.

Centralised here so the workshop ViewSet, the owner confirmation view, and
the superadmin dispute / reverse endpoints all share the same atomic
transitions and the same audit-log writes.
"""
from __future__ import annotations

from typing import Any

from decimal import Decimal

from django.contrib.auth import get_user_model
from django.db import transaction
from django.utils import timezone
from django_tenants.utils import schema_context
from rest_framework.exceptions import PermissionDenied, ValidationError

from .audit import actor_context, log_vehicle_event
from .models import (
    GlobalOwner,
    GlobalVehicle,
    OwnershipTransfer,
    TenantPlatformBilling,
    TransferBilling,
    VehicleAuditEvent,
    VehicleClaimToken,
    VehicleOwnership,
    VehicleRegistrationCharge,
)
from .services import (
    create_owner_claim_token,
    create_transfer_token,
    get_or_create_owner_for_user,
    normalize_plate,
)

User = get_user_model()


# ---------------------------------------------------------------------------
# Initiate
# ---------------------------------------------------------------------------


@transaction.atomic
def initiate_transfer(
    *,
    vehicle: GlobalVehicle,
    initiator: User,
    tenant,
    documents_verified: bool,
    new_license_plate: str,
    notes: str,
    request=None,
) -> OwnershipTransfer:
    """Workshop-initiated ownership transfer."""

    if initiator.role not in {User.Role.ADMIN, User.Role.MECHANIC}:
        raise PermissionDenied(
            "Only workshop admins and mechanics may initiate ownership transfers.",
        )

    if not tenant:
        raise ValidationError("Initiating user is not linked to a workshop tenant.")

    # Block if there is an unresolved DISPUTED transfer on the vehicle.
    if vehicle.transfers.filter(status=OwnershipTransfer.Status.DISPUTED).exists():
        raise ValidationError(
            "This vehicle has a disputed transfer awaiting platform review. "
            "Ownership changes are frozen until the dispute is resolved.",
        )

    # Block if there's an existing PENDING transfer the workshop hasn't
    # cancelled — keeps the workflow deterministic for the owner.
    existing_pending = vehicle.transfers.filter(
        status=OwnershipTransfer.Status.PENDING,
    ).first()
    if existing_pending is not None:
        raise ValidationError(
            "A pending transfer already exists for this vehicle. "
            "Cancel it before starting a new one.",
        )

    # Reuse the existing QR token machinery — handles document checks +
    # plate normalisation + expiry.
    claim_token = create_transfer_token(
        vehicle=vehicle,
        created_by=initiator,
        tenant=tenant,
        documents_verified=documents_verified,
        new_license_plate=new_license_plate,
        notes=notes,
    )

    billing_config = TenantPlatformBilling.for_tenant(tenant)
    actor = actor_context(request)

    transfer = OwnershipTransfer.objects.create(
        vehicle=vehicle,
        from_owner=vehicle.current_owner,
        initiated_by_tenant=tenant,
        initiated_by_user=initiator,
        initiated_ip=actor["request_ip"],
        initiated_user_agent=actor["request_user_agent"],
        claim_token=claim_token,
        documents_verified=True,
        new_license_plate=normalize_plate(new_license_plate),
        initiator_notes=notes or "",
        status=OwnershipTransfer.Status.PENDING,
    )

    TransferBilling.objects.create(
        transfer=transfer,
        fee_amount=billing_config.transfer_fee_amount,
        fee_currency=billing_config.transfer_fee_currency,
        snapshot=billing_config.transfer_snapshot(),
    )

    log_vehicle_event(
        entity=VehicleAuditEvent.Entity.OWNERSHIP,
        action=VehicleAuditEvent.Action.TRANSFER_INITIATED,
        vehicle=vehicle,
        request=request,
        actor_user=initiator,
        explicit_tenant_schema=getattr(tenant, "schema_name", None),
        explicit_tenant_name=getattr(tenant, "name", None),
        target_id=str(transfer.id),
        changes={
            "from_owner": {
                "before": None,
                "after": getattr(vehicle.current_owner, "name", None),
            },
            "new_license_plate": {
                "before": vehicle.license_plate,
                "after": transfer.new_license_plate,
            },
        },
        note=f"Initiated via QR token {claim_token.id}",
    )

    return transfer


# ---------------------------------------------------------------------------
# Cancel
# ---------------------------------------------------------------------------


@transaction.atomic
def cancel_transfer(
    *,
    transfer: OwnershipTransfer,
    user: User,
    request=None,
) -> OwnershipTransfer:
    if transfer.status != OwnershipTransfer.Status.PENDING:
        raise ValidationError(
            "Only pending transfers can be cancelled.",
        )
    if user.id != transfer.initiated_by_user_id and not user.is_superuser:
        raise PermissionDenied(
            "Only the workshop that initiated the transfer may cancel it.",
        )

    transfer.status = OwnershipTransfer.Status.CANCELLED
    transfer.save(update_fields=["status"])

    # Invalidate the QR token so the recipient can't redeem it after cancel.
    if transfer.claim_token.used_at is None:
        transfer.claim_token.used_at = timezone.now()
        transfer.claim_token.used_by = user
        transfer.claim_token.save(update_fields=["used_at", "used_by"])

    log_vehicle_event(
        entity=VehicleAuditEvent.Entity.OWNERSHIP,
        action=VehicleAuditEvent.Action.TRANSFER_CANCELLED,
        vehicle=transfer.vehicle,
        request=request,
        target_id=str(transfer.id),
        note=f"Cancelled by {user.username}",
    )
    return transfer


# ---------------------------------------------------------------------------
# Confirm (owner)
# ---------------------------------------------------------------------------


@transaction.atomic
def confirm_transfer(
    *,
    transfer: OwnershipTransfer,
    user: User,
    request=None,
) -> OwnershipTransfer:
    if user.role != User.Role.OWNER:
        raise PermissionDenied(
            "Only vehicle owner accounts may confirm transfers.",
        )

    # Idempotent: once confirmed, returning the same row is harmless.
    if transfer.status == OwnershipTransfer.Status.CONFIRMED:
        return transfer

    if transfer.status != OwnershipTransfer.Status.PENDING:
        raise ValidationError(
            f"Cannot confirm a transfer in state '{transfer.status}'.",
        )

    if transfer.claim_token.expires_at <= timezone.now():
        transfer.status = OwnershipTransfer.Status.EXPIRED
        transfer.save(update_fields=["status"])
        log_vehicle_event(
            entity=VehicleAuditEvent.Entity.OWNERSHIP,
            action=VehicleAuditEvent.Action.TRANSFER_EXPIRED,
            vehicle=transfer.vehicle,
            request=request,
            target_id=str(transfer.id),
        )
        raise ValidationError("This transfer has expired. Ask the workshop for a new QR.")

    new_owner = get_or_create_owner_for_user(user)

    vehicle = transfer.vehicle
    active = (
        VehicleOwnership.objects.select_for_update()
        .filter(vehicle=vehicle, effective_to__isnull=True)
        .first()
    )
    now = timezone.now()
    if active is not None:
        # Sanity guard: ownership must not have changed since initiation.
        if transfer.from_owner_id and active.owner_id != transfer.from_owner_id:
            raise ValidationError(
                "Ownership changed since this transfer was initiated. Request a new QR.",
            )
        active.effective_to = now
        active.save(update_fields=["effective_to"])

    new_plate = transfer.new_license_plate or vehicle.license_plate
    if new_plate and new_plate != vehicle.license_plate:
        old_plate = vehicle.license_plate
        vehicle.license_plate = new_plate
        vehicle.save(update_fields=["license_plate", "updated_at"])
        log_vehicle_event(
            entity=VehicleAuditEvent.Entity.REGISTRATION,
            action=VehicleAuditEvent.Action.UPDATED,
            vehicle=vehicle,
            request=request,
            target_id=str(vehicle.id),
            changes={"license_plate": {"before": old_plate, "after": new_plate}},
        )

    VehicleOwnership.objects.create(
        vehicle=vehicle,
        owner=new_owner,
        effective_from=now,
        license_plate=new_plate,
        claim_method="transfer",
    )

    # Close the underlying claim token (no double-redeem).
    if transfer.claim_token.used_at is None:
        transfer.claim_token.used_at = now
        transfer.claim_token.used_by = user
        transfer.claim_token.save(update_fields=["used_at", "used_by"])

    actor = actor_context(request)
    transfer.to_owner = new_owner
    transfer.confirmed_at = now
    transfer.confirmed_by_user = user
    transfer.confirmed_ip = actor["request_ip"]
    transfer.confirmed_user_agent = actor["request_user_agent"]
    transfer.status = OwnershipTransfer.Status.CONFIRMED
    transfer.save(
        update_fields=[
            "to_owner",
            "confirmed_at",
            "confirmed_by_user",
            "confirmed_ip",
            "confirmed_user_agent",
            "status",
        ],
    )

    log_vehicle_event(
        entity=VehicleAuditEvent.Entity.OWNERSHIP,
        action=VehicleAuditEvent.Action.TRANSFER_CONFIRMED,
        vehicle=vehicle,
        request=request,
        target_id=str(transfer.id),
        changes={
            "to_owner": {
                "before": getattr(transfer.from_owner, "name", None),
                "after": new_owner.name,
            },
        },
    )

    return transfer


# ---------------------------------------------------------------------------
# Superadmin actions
# ---------------------------------------------------------------------------


@transaction.atomic
def dispute_transfer(
    *,
    transfer: OwnershipTransfer,
    superadmin: User,
    notes: str,
    request=None,
) -> OwnershipTransfer:
    if not superadmin.is_superuser:
        raise PermissionDenied("Platform superuser access required.")
    if not notes.strip():
        raise ValidationError("Dispute requires explanatory notes.")

    transfer.status = OwnershipTransfer.Status.DISPUTED
    transfer.superadmin_notes = (
        (transfer.superadmin_notes + "\n\n").lstrip() + f"[DISPUTE] {notes}"
    )
    transfer.save(update_fields=["status", "superadmin_notes"])

    log_vehicle_event(
        entity=VehicleAuditEvent.Entity.OWNERSHIP,
        action=VehicleAuditEvent.Action.TRANSFER_DISPUTED,
        vehicle=transfer.vehicle,
        request=request,
        target_id=str(transfer.id),
        note=notes[:512],
    )
    return transfer


@transaction.atomic
def reverse_transfer(
    *,
    transfer: OwnershipTransfer,
    superadmin: User,
    notes: str,
    request=None,
) -> OwnershipTransfer:
    """Append a new transfer row that flips ownership back. Never deletes."""
    if not superadmin.is_superuser:
        raise PermissionDenied("Platform superuser access required.")
    if not notes.strip():
        raise ValidationError("Reversal requires explanatory notes.")
    if transfer.status not in (
        OwnershipTransfer.Status.CONFIRMED,
        OwnershipTransfer.Status.DISPUTED,
    ):
        raise ValidationError(
            "Only confirmed or disputed transfers can be reversed.",
        )

    vehicle = transfer.vehicle
    original_from = transfer.from_owner
    if original_from is None:
        raise ValidationError(
            "Cannot reverse a transfer with no recorded previous owner.",
        )

    # Close the current (post-transfer) ownership row.
    now = timezone.now()
    active = (
        VehicleOwnership.objects.select_for_update()
        .filter(vehicle=vehicle, effective_to__isnull=True)
        .first()
    )
    if active is not None:
        active.effective_to = now
        active.save(update_fields=["effective_to"])

    # Restore the pre-transfer plate by walking back to the most recent
    # *closed* ownership for the original owner. That row stored the plate
    # they had before this transfer rewrote it.
    prior = (
        VehicleOwnership.objects.filter(vehicle=vehicle, owner=original_from)
        .exclude(id=active.id if active else None)
        .order_by("-effective_from")
        .first()
    )
    restored_plate = prior.license_plate if prior and prior.license_plate else vehicle.license_plate
    old_plate = vehicle.license_plate
    if restored_plate and restored_plate != vehicle.license_plate:
        vehicle.license_plate = restored_plate
        vehicle.save(update_fields=["license_plate", "updated_at"])
        log_vehicle_event(
            entity=VehicleAuditEvent.Entity.REGISTRATION,
            action=VehicleAuditEvent.Action.UPDATED,
            vehicle=vehicle,
            request=request,
            target_id=str(vehicle.id),
            changes={"license_plate": {"before": old_plate, "after": restored_plate}},
            note="Restored on transfer reversal",
        )

    # Re-open ownership for the original owner.
    VehicleOwnership.objects.create(
        vehicle=vehicle,
        owner=original_from,
        effective_from=now,
        license_plate=vehicle.license_plate,
        claim_method="reversal",
    )

    transfer.status = OwnershipTransfer.Status.REVERSED
    transfer.superadmin_notes = (
        (transfer.superadmin_notes + "\n\n").lstrip() + f"[REVERSAL] {notes}"
    )
    transfer.save(update_fields=["status", "superadmin_notes"])

    # Waive the platform fee — a reversed transfer shouldn't be charged.
    # Refunded > waived if the customer already paid; preserve that signal.
    billing = getattr(transfer, "billing", None)
    if billing is not None and billing.payment_status not in (
        TransferBilling.PaymentStatus.PAID,
        TransferBilling.PaymentStatus.REFUNDED,
    ):
        billing.payment_status = TransferBilling.PaymentStatus.WAIVED
        billing.save(update_fields=["payment_status", "updated_at"])

    log_vehicle_event(
        entity=VehicleAuditEvent.Entity.OWNERSHIP,
        action=VehicleAuditEvent.Action.TRANSFER_REVERSED,
        vehicle=vehicle,
        request=request,
        actor_user=superadmin,
        target_id=str(transfer.id),
        note=notes[:512],
    )

    return transfer


@transaction.atomic
def update_billing(
    *,
    billing: TransferBilling,
    superadmin: User,
    new_status: str | None = None,
    invoice_reference: str | None = None,
    request=None,
) -> TransferBilling:
    if not superadmin.is_superuser:
        raise PermissionDenied("Platform superuser access required.")

    changes: dict[str, dict[str, Any]] = {}
    if new_status and new_status != billing.payment_status:
        if new_status not in dict(TransferBilling.PaymentStatus.choices):
            raise ValidationError("Unknown payment status.")
        changes["payment_status"] = {
            "before": billing.payment_status,
            "after": new_status,
        }
        billing.payment_status = new_status
        if new_status == TransferBilling.PaymentStatus.PAID and billing.paid_at is None:
            billing.paid_at = timezone.now()
            billing.captured_by = superadmin

    if invoice_reference is not None and invoice_reference != billing.invoice_reference:
        changes["invoice_reference"] = {
            "before": billing.invoice_reference,
            "after": invoice_reference,
        }
        billing.invoice_reference = invoice_reference

    if not changes:
        return billing

    billing.save()

    log_vehicle_event(
        entity=VehicleAuditEvent.Entity.BILLING,
        action=VehicleAuditEvent.Action.BILLING_CHANGED,
        vehicle=billing.transfer.vehicle,
        request=request,
        target_id=str(billing.transfer_id),
        changes=changes,
    )
    return billing


# ---------------------------------------------------------------------------
# Vehicle registration charge — created when a tenant adds a vehicle to the
# global registry. Snapshots the per-tenant fee config so changes never
# rewrite history.
# ---------------------------------------------------------------------------


@transaction.atomic
def record_registration_charge(
    *,
    vehicle: GlobalVehicle,
    tenant,
    created_by,
    request=None,
) -> VehicleRegistrationCharge | None:
    """Idempotent — never charges the same vehicle twice."""
    if not tenant or not vehicle:
        return None
    existing = VehicleRegistrationCharge.objects.filter(vehicle=vehicle).first()
    if existing is not None:
        return existing

    config = TenantPlatformBilling.for_tenant(tenant)
    charge = VehicleRegistrationCharge.objects.create(
        vehicle=vehicle,
        tenant=tenant,
        created_by=created_by,
        fee_amount=config.registration_fee_amount,
        fee_currency=config.registration_fee_currency,
        snapshot=config.registration_snapshot(),
    )
    log_vehicle_event(
        entity=VehicleAuditEvent.Entity.BILLING,
        action=VehicleAuditEvent.Action.BILLING_CHANGED,
        vehicle=vehicle,
        request=request,
        target_id=str(charge.id),
        changes={
            "registration_fee": {
                "before": None,
                "after": f"{charge.fee_amount} {charge.fee_currency}",
            },
        },
        note=f"Registration charge for tenant {tenant.name}",
    )
    return charge


@transaction.atomic
def update_registration_charge(
    *,
    charge: VehicleRegistrationCharge,
    superadmin,
    new_status: str | None = None,
    invoice_reference: str | None = None,
    request=None,
) -> VehicleRegistrationCharge:
    if not superadmin.is_superuser:
        raise PermissionDenied("Platform superuser access required.")

    changes: dict[str, Any] = {}
    if new_status and new_status != charge.payment_status:
        if new_status not in dict(VehicleRegistrationCharge.PaymentStatus.choices):
            raise ValidationError("Unknown payment status.")
        changes["payment_status"] = {"before": charge.payment_status, "after": new_status}
        charge.payment_status = new_status
        if (
            new_status == VehicleRegistrationCharge.PaymentStatus.PAID
            and charge.paid_at is None
        ):
            charge.paid_at = timezone.now()

    if invoice_reference is not None and invoice_reference != charge.invoice_reference:
        changes["invoice_reference"] = {
            "before": charge.invoice_reference,
            "after": invoice_reference,
        }
        charge.invoice_reference = invoice_reference

    if not changes:
        return charge

    charge.save()
    log_vehicle_event(
        entity=VehicleAuditEvent.Entity.BILLING,
        action=VehicleAuditEvent.Action.BILLING_CHANGED,
        vehicle=charge.vehicle,
        request=request,
        target_id=str(charge.id),
        changes=changes,
        note="Registration charge",
    )
    return charge


# ---------------------------------------------------------------------------
# Tenant platform-billing config — superadmin CRUD with auditing
# ---------------------------------------------------------------------------


def _sync_tenant_subscription_plan_label(billing: TenantPlatformBilling) -> None:
    """
    Keep ``WorkshopTenant.subscription_plan`` aligned with platform billing.

    Clears stale ``trial`` when a workshop moves to paid billing. Preserves an
    explicit ``trial`` only while billing remains free/none.
    """
    tenant = billing.tenant
    if (
        billing.subscription_period != TenantPlatformBilling.SubscriptionPeriod.NONE
        and billing.subscription_fee_amount > Decimal("0.00")
    ):
        if tenant.subscription_plan == "trial":
            tenant.subscription_plan = "none"
            tenant.save(update_fields=["subscription_plan"])
        return

    if (
        billing.subscription_period == TenantPlatformBilling.SubscriptionPeriod.NONE
        and billing.subscription_fee_amount <= Decimal("0.00")
        and tenant.subscription_plan not in {"trial"}
    ):
        if tenant.subscription_plan != "none":
            tenant.subscription_plan = "none"
            tenant.save(update_fields=["subscription_plan"])


@transaction.atomic
def update_tenant_platform_billing(
    *,
    billing: TenantPlatformBilling,
    superadmin,
    fields: dict[str, Any],
    request=None,
) -> TenantPlatformBilling:
    if not superadmin.is_superuser:
        raise PermissionDenied("Platform superuser access required.")

    AUDITABLE = [
        "transfer_fee_amount",
        "transfer_fee_currency",
        "registration_fee_amount",
        "registration_fee_currency",
        "subscription_fee_amount",
        "subscription_fee_currency",
        "subscription_period",
        "subscription_next_charge_at",
        "notes",
    ]
    changes: dict[str, dict[str, Any]] = {}
    for f in AUDITABLE:
        if f not in fields:
            continue
        new = fields[f]
        old = getattr(billing, f)
        if str(old) == str(new):
            continue
        changes[f] = {"before": str(old) if old is not None else None,
                      "after": str(new) if new is not None else None}
        setattr(billing, f, new)

    if (
        "subscription_period" in fields
        and billing.subscription_period
        not in {TenantPlatformBilling.SubscriptionPeriod.NONE}
        and billing.subscription_next_charge_at is None
    ):
        billing.subscription_next_charge_at = timezone.now()
        changes["subscription_next_charge_at"] = {
            "before": None,
            "after": billing.subscription_next_charge_at.isoformat(),
        }

    if not changes:
        return billing

    billing.updated_by = superadmin
    billing.save()

    _sync_tenant_subscription_plan_label(billing)

    log_vehicle_event(
        entity=VehicleAuditEvent.Entity.BILLING,
        action=VehicleAuditEvent.Action.BILLING_CHANGED,
        vehicle=None,
        request=request,
        target_id=str(billing.tenant_id),
        changes=changes,
        note=f"Platform billing for tenant {billing.tenant.name}",
        explicit_tenant_schema=billing.tenant.schema_name,
        explicit_tenant_name=billing.tenant.name,
    )
    return billing
