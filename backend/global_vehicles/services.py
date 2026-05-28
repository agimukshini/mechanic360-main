"""
Business logic for global vehicle ownership and QR claim flows.
"""
from __future__ import annotations

from django.contrib.auth import get_user_model
from django.db import transaction
from django.utils import timezone
from rest_framework.exceptions import ValidationError

from .models import GlobalOwner, GlobalVehicle, VehicleClaimToken, VehicleOwnership

User = get_user_model()


class ClaimTokenError(ValidationError):
    pass


def normalize_plate(value: str) -> str:
    plate = (value or "").strip().upper()
    if not plate:
        raise ValidationError("License plate is required.")
    return plate


def get_or_create_owner_for_user(user: User) -> GlobalOwner:
    if hasattr(user, "global_owner_profile") and user.global_owner_profile:
        return user.global_owner_profile

    display_name = user.get_full_name().strip() or user.username
    owner, _created = GlobalOwner.objects.get_or_create(
        user=user,
        defaults={
            "name": display_name,
            "email": user.email or f"{user.username}@owner.local",
        },
    )
    return owner


def update_vehicle_registration(
    *,
    vehicle: GlobalVehicle,
    license_plate: str,
    sync_active_ownership: bool = True,
) -> GlobalVehicle:
    """
    Update the vehicle's current registration plate.

    Keeps the active ownership record in sync so registration history stays accurate.
    """
    plate = normalize_plate(license_plate)
    vehicle.license_plate = plate
    vehicle.save(update_fields=["license_plate", "updated_at"])

    if sync_active_ownership:
        VehicleOwnership.objects.filter(
            vehicle=vehicle,
            effective_to__isnull=True,
        ).update(license_plate=plate)

    return vehicle


def create_owner_claim_token(
    *,
    vehicle: GlobalVehicle,
    created_by: User,
    tenant,
    notes: str = "",
) -> VehicleClaimToken:
    if vehicle.current_owner is not None:
        raise ValidationError(
            "This vehicle already has an owner. Use ownership transfer instead.",
        )

    return VehicleClaimToken.objects.create(
        vehicle=vehicle,
        purpose=VehicleClaimToken.Purpose.OWNER_CLAIM,
        created_by=created_by,
        created_by_tenant=tenant,
        notes=notes,
        expires_at=VehicleClaimToken.default_expiry(),
    )


def create_transfer_token(
    *,
    vehicle: GlobalVehicle,
    created_by: User,
    tenant,
    documents_verified: bool,
    new_license_plate: str,
    notes: str = "",
) -> VehicleClaimToken:
    current_owner = vehicle.current_owner
    if current_owner is None:
        raise ValidationError(
            "This vehicle has no registered owner. Generate an owner claim QR instead.",
        )
    if not documents_verified:
        raise ValidationError(
            "Document verification is required before initiating an ownership transfer.",
        )

    plate = normalize_plate(new_license_plate)

    return VehicleClaimToken.objects.create(
        vehicle=vehicle,
        purpose=VehicleClaimToken.Purpose.OWNERSHIP_TRANSFER,
        from_owner=current_owner,
        new_license_plate=plate,
        created_by=created_by,
        created_by_tenant=tenant,
        documents_verified=True,
        notes=notes,
        expires_at=VehicleClaimToken.default_expiry(),
    )


def parse_claim_token_id(raw: str) -> str:
    token = (raw or "").strip()
    if token.startswith("m360:claim:"):
        token = token.split(":", 2)[2]
    return token


@transaction.atomic
def redeem_claim_token(*, token_id: str, user: User) -> VehicleOwnership:
    if user.role != User.Role.OWNER:
        raise ClaimTokenError("Only vehicle owner accounts can claim vehicles.")

    try:
        claim_token = VehicleClaimToken.objects.select_related(
            "vehicle",
            "from_owner",
        ).get(id=parse_claim_token_id(token_id))
    except (VehicleClaimToken.DoesNotExist, ValueError):
        raise ClaimTokenError("Invalid or unknown claim token.")

    if claim_token.used_at is not None:
        raise ClaimTokenError("This QR code has already been used.")
    if claim_token.expires_at <= timezone.now():
        raise ClaimTokenError("This QR code has expired. Ask the workshop for a new one.")

    vehicle = claim_token.vehicle
    new_owner = get_or_create_owner_for_user(user)

    if claim_token.purpose == VehicleClaimToken.Purpose.OWNER_CLAIM:
        if vehicle.current_owner is not None:
            raise ClaimTokenError(
                "This vehicle already has an owner. Use a transfer QR from the workshop.",
            )
        ownership = VehicleOwnership.objects.create(
            vehicle=vehicle,
            owner=new_owner,
            license_plate=vehicle.license_plate,
            claim_method="qr_claim",
        )
    elif claim_token.purpose == VehicleClaimToken.Purpose.OWNERSHIP_TRANSFER:
        if not claim_token.documents_verified:
            raise ClaimTokenError("Transfer token is missing document verification.")
        if not claim_token.new_license_plate:
            raise ClaimTokenError("Transfer token is missing the new registration plate.")
        current = vehicle.current_owner
        if current is None or claim_token.from_owner_id != current.id:
            raise ClaimTokenError(
                "Ownership changed since this transfer was initiated. Request a new QR.",
            )
        active = (
            VehicleOwnership.objects.select_for_update()
            .filter(vehicle=vehicle, effective_to__isnull=True)
            .first()
        )
        if not active:
            raise ClaimTokenError("No active ownership record found for this vehicle.")
        now = timezone.now()
        active.effective_to = now
        active.save(update_fields=["effective_to"])

        new_plate = claim_token.new_license_plate
        vehicle.license_plate = new_plate
        vehicle.save(update_fields=["license_plate", "updated_at"])

        ownership = VehicleOwnership.objects.create(
            vehicle=vehicle,
            owner=new_owner,
            effective_from=now,
            license_plate=new_plate,
            claim_method="transfer",
        )
    else:
        raise ClaimTokenError("Unsupported claim token type.")

    claim_token.used_at = timezone.now()
    claim_token.used_by = user
    claim_token.save(update_fields=["used_at", "used_by"])

    return ownership
