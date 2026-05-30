from __future__ import annotations

import io
import base64

import qrcode
from rest_framework import serializers

from .models import (
    GlobalOwner,
    GlobalVehicle,
    OwnershipTransfer,
    PlatformInvoice,
    TenantPlatformBilling,
    TransferBilling,
    VehicleAuditEvent,
    VehicleClaimToken,
    VehicleOwnership,
    VehicleRegistrationCharge,
)


class GlobalOwnerSerializer(serializers.ModelSerializer):
    class Meta:
        model = GlobalOwner
        fields = ["id", "name", "email", "phone", "created_at"]
        read_only_fields = fields


class VehicleOwnershipSerializer(serializers.ModelSerializer):
    owner = GlobalOwnerSerializer(read_only=True)
    is_current = serializers.SerializerMethodField()

    class Meta:
        model = VehicleOwnership
        fields = [
            "id",
            "owner",
            "license_plate",
            "effective_from",
            "effective_to",
            "claim_method",
            "is_current",
        ]
        read_only_fields = fields

    def get_is_current(self, obj) -> bool:
        return obj.effective_to is None


class GlobalVehicleSerializer(serializers.ModelSerializer):
    registered_by_tenant_name = serializers.CharField(
        source="registered_by_tenant.name",
        read_only=True,
    )
    current_owner = GlobalOwnerSerializer(read_only=True)
    registration_history = serializers.SerializerMethodField()

    class Meta:
        model = GlobalVehicle
        fields = [
            "id",
            "vin",
            "license_plate",
            "make",
            "model",
            "year",
            "engine_type",
            "fuel_type",
            "odometer_km",
            "hour_meter",
            "photo",
            "is_active",
            "registered_by_tenant",
            "registered_by_tenant_name",
            "registered_by",
            "current_owner",
            "registration_history",
            "created_at",
            "updated_at",
        ]
        read_only_fields = [
            "id",
            "vin",
            "registered_by_tenant",
            "registered_by_tenant_name",
            "registered_by",
            "current_owner",
            "registration_history",
            "created_at",
            "updated_at",
        ]

    def get_registration_history(self, obj):
        ownerships = getattr(obj, "_prefetched_objects_cache", {}).get("ownerships")
        if ownerships is None:
            ownerships = obj.ownerships.select_related("owner").order_by("-effective_from")
        return VehicleOwnershipSerializer(ownerships, many=True).data

    def to_representation(self, instance):
        data = super().to_representation(instance)
        if instance.photo:
            url = instance.photo.url
            request = self.context.get("request")
            if request and url.startswith("/"):
                data["photo"] = request.build_absolute_uri(url)
            else:
                data["photo"] = url
        else:
            data["photo"] = None
        return data

    def validate_vin(self, value: str) -> str:
        vin = (value or "").strip().upper()
        if len(vin) < 3:
            raise serializers.ValidationError("VIN must be at least 3 characters.")
        return vin

    def validate_license_plate(self, value: str) -> str:
        from .services import normalize_plate

        return normalize_plate(value)

    def validate(self, attrs):
        if self.instance and "vin" in attrs and attrs["vin"] != self.instance.vin:
            raise serializers.ValidationError({"vin": "VIN cannot be changed after registration."})
        return attrs


class UpdateRegistrationSerializer(serializers.Serializer):
    license_plate = serializers.CharField(max_length=32)

    def validate_license_plate(self, value: str) -> str:
        from .services import normalize_plate

        return normalize_plate(value)


class VehicleClaimTokenSerializer(serializers.ModelSerializer):
    vehicle = GlobalVehicleSerializer(read_only=True)
    qr_payload = serializers.CharField(read_only=True)

    class Meta:
        model = VehicleClaimToken
        fields = [
            "id",
            "vehicle",
            "purpose",
            "qr_payload",
            "new_license_plate",
            "documents_verified",
            "expires_at",
            "used_at",
            "created_at",
        ]
        read_only_fields = fields


class OwnerRegisterSerializer(serializers.Serializer):
    username = serializers.CharField(max_length=150)
    email = serializers.EmailField()
    password = serializers.CharField(write_only=True, min_length=8)
    first_name = serializers.CharField(max_length=150, required=False, allow_blank=True)
    last_name = serializers.CharField(max_length=150, required=False, allow_blank=True)
    phone = serializers.CharField(max_length=32, required=False, allow_blank=True)

    def validate_username(self, value: str) -> str:
        from django.contrib.auth import get_user_model

        User = get_user_model()
        if User.objects.filter(username__iexact=value).exists():
            raise serializers.ValidationError("This username is already taken.")
        return value

    def create(self, validated_data):
        from django.contrib.auth import get_user_model

        from .models import GlobalOwner

        User = get_user_model()
        phone = validated_data.pop("phone", "")
        user = User(
            username=validated_data["username"],
            email=validated_data["email"],
            first_name=validated_data.get("first_name", ""),
            last_name=validated_data.get("last_name", ""),
            role=User.Role.OWNER,
            tenant=None,
        )
        user.set_password(validated_data["password"])
        user.save()

        name = user.get_full_name().strip() or user.username
        GlobalOwner.objects.create(
            user=user,
            name=name,
            email=user.email,
            phone=phone,
        )
        return user


class ClaimVehicleSerializer(serializers.Serializer):
    token = serializers.CharField()


# -----------------------------------------------------------------------------
# Ownership transfer + billing
# -----------------------------------------------------------------------------


class TransferBillingSerializer(serializers.ModelSerializer):
    class Meta:
        model = TransferBilling
        fields = [
            "id",
            "fee_amount",
            "fee_currency",
            "payment_status",
            "invoice_reference",
            "paid_at",
            "captured_by",
            "snapshot",
            "created_at",
            "updated_at",
        ]
        # Fee is immutable; all editable fields are gated by the superadmin
        # ViewSet, never by direct PATCH on this serializer.
        read_only_fields = fields


class OwnershipTransferSerializer(serializers.ModelSerializer):
    from_owner = GlobalOwnerSerializer(read_only=True)
    to_owner = GlobalOwnerSerializer(read_only=True)
    billing = TransferBillingSerializer(read_only=True)
    claim_token_id = serializers.UUIDField(source="claim_token.id", read_only=True)
    qr_payload = serializers.CharField(source="claim_token.qr_payload", read_only=True)
    expires_at = serializers.DateTimeField(source="claim_token.expires_at", read_only=True)
    vehicle = GlobalVehicleSerializer(read_only=True)
    tenant_name = serializers.CharField(source="initiated_by_tenant.name", read_only=True)
    tenant_schema = serializers.CharField(
        source="initiated_by_tenant.schema_name",
        read_only=True,
    )
    initiator_username = serializers.CharField(
        source="initiated_by_user.username",
        read_only=True,
    )

    class Meta:
        model = OwnershipTransfer
        fields = [
            "id",
            "vehicle",
            "from_owner",
            "to_owner",
            "tenant_name",
            "tenant_schema",
            "initiator_username",
            "initiated_at",
            "initiated_ip",
            "initiated_user_agent",
            "claim_token_id",
            "qr_payload",
            "expires_at",
            "confirmed_at",
            "confirmed_ip",
            "confirmed_user_agent",
            "status",
            "initiator_notes",
            "superadmin_notes",
            "documents_verified",
            "new_license_plate",
            "billing",
            "reversed_transfer",
        ]
        read_only_fields = fields


class TenantOwnershipTransferSerializer(OwnershipTransferSerializer):
    """
    Workshop-side view — strips out IP / UA and superadmin-only fields.
    Used for both the tenant-side list and the owner-portal pending list.
    """

    class Meta(OwnershipTransferSerializer.Meta):
        fields = [
            "id",
            "vehicle",
            "from_owner",
            "to_owner",
            "tenant_name",
            "initiator_username",
            "initiated_at",
            "claim_token_id",
            "qr_payload",
            "expires_at",
            "confirmed_at",
            "status",
            "initiator_notes",
            "documents_verified",
            "new_license_plate",
            "billing",
        ]
        read_only_fields = fields


class StartTransferSerializer(serializers.Serializer):
    documents_verified = serializers.BooleanField(default=False)
    new_license_plate = serializers.CharField(max_length=32)
    notes = serializers.CharField(allow_blank=True, required=False, default="")


class DisputeOrReverseSerializer(serializers.Serializer):
    notes = serializers.CharField(min_length=3, max_length=2000)


class UpdateBillingSerializer(serializers.Serializer):
    payment_status = serializers.ChoiceField(
        choices=TransferBilling.PaymentStatus.choices,
        required=False,
    )
    invoice_reference = serializers.CharField(
        max_length=64, allow_blank=True, required=False,
    )


# -----------------------------------------------------------------------------
# Audit
# -----------------------------------------------------------------------------


class TenantPlatformBillingSerializer(serializers.ModelSerializer):
    """Per-tenant fee config — what the PLATFORM charges this workshop."""

    tenant_id = serializers.UUIDField(source="tenant.id", read_only=True)
    tenant_name = serializers.CharField(source="tenant.name", read_only=True)
    tenant_schema = serializers.CharField(
        source="tenant.schema_name", read_only=True,
    )
    updated_by_username = serializers.CharField(
        source="updated_by.username", read_only=True,
    )

    class Meta:
        model = TenantPlatformBilling
        fields = [
            "id",
            "tenant_id",
            "tenant_name",
            "tenant_schema",
            "transfer_fee_amount",
            "transfer_fee_currency",
            "registration_fee_amount",
            "registration_fee_currency",
            "subscription_fee_amount",
            "subscription_fee_currency",
            "subscription_period",
            "subscription_next_charge_at",
            "notes",
            "updated_by",
            "updated_by_username",
            "created_at",
            "updated_at",
        ]
        read_only_fields = [
            "id",
            "tenant_id",
            "tenant_name",
            "tenant_schema",
            "updated_by",
            "updated_by_username",
            "created_at",
            "updated_at",
        ]

    def validate(self, attrs):
        for amount_field in (
            "transfer_fee_amount",
            "registration_fee_amount",
            "subscription_fee_amount",
        ):
            if amount_field in attrs and attrs[amount_field] < 0:
                raise serializers.ValidationError(
                    {amount_field: "Fee cannot be negative."},
                )
        for ccy_field in (
            "transfer_fee_currency",
            "registration_fee_currency",
            "subscription_fee_currency",
        ):
            if ccy_field in attrs:
                v = (attrs[ccy_field] or "").strip().upper()
                if len(v) != 3:
                    raise serializers.ValidationError(
                        {ccy_field: "Currency must be a 3-letter ISO code."},
                    )
                attrs[ccy_field] = v
        return attrs


class VehicleRegistrationChargeSerializer(serializers.ModelSerializer):
    tenant_name = serializers.CharField(source="tenant.name", read_only=True)
    vehicle_license_plate = serializers.CharField(
        source="vehicle.license_plate", read_only=True,
    )
    vehicle_vin = serializers.CharField(source="vehicle.vin", read_only=True)

    class Meta:
        model = VehicleRegistrationCharge
        fields = [
            "id",
            "vehicle",
            "vehicle_license_plate",
            "vehicle_vin",
            "tenant",
            "tenant_name",
            "fee_amount",
            "fee_currency",
            "payment_status",
            "invoice_reference",
            "paid_at",
            "snapshot",
            "created_at",
            "updated_at",
        ]
        read_only_fields = fields


class PlatformInvoiceSerializer(serializers.ModelSerializer):
    tenant_name = serializers.CharField(source="tenant.name", read_only=True)
    tenant_schema = serializers.CharField(source="tenant.schema_name", read_only=True)
    captured_by_username = serializers.CharField(
        source="captured_by.username", read_only=True,
    )

    class Meta:
        model = PlatformInvoice
        fields = [
            "id",
            "invoice_number",
            "tenant",
            "tenant_name",
            "tenant_schema",
            "kind",
            "amount",
            "currency",
            "payment_status",
            "invoice_reference",
            "paid_at",
            "captured_by",
            "captured_by_username",
            "period_start",
            "period_end",
            "due_at",
            "issued_at",
            "line_items",
            "snapshot",
            "notes",
            "created_at",
            "updated_at",
        ]
        read_only_fields = fields


class UpdatePlatformInvoiceSerializer(serializers.Serializer):
    payment_status = serializers.ChoiceField(
        choices=TransferBilling.PaymentStatus.choices,
        required=False,
    )
    invoice_reference = serializers.CharField(
        max_length=64, allow_blank=True, required=False,
    )
    notes = serializers.CharField(allow_blank=True, required=False)


class VehicleAuditEventSerializer(serializers.ModelSerializer):
    class Meta:
        model = VehicleAuditEvent
        fields = [
            "id",
            "tenant_schema",
            "tenant_name",
            "vehicle_tenant_id",
            "global_vehicle_id",
            "entity",
            "action",
            "target_id",
            "actor_user_id",
            "actor_username",
            "actor_role",
            "request_ip",
            "request_user_agent",
            "changes",
            "note",
            "occurred_at",
        ]
        read_only_fields = fields


def qr_code_response(*, payload: str, extra: dict | None = None) -> dict:
    qr = qrcode.QRCode(
        version=1,
        error_correction=qrcode.constants.ERROR_CORRECT_L,
        box_size=10,
        border=4,
    )
    qr.add_data(payload)
    qr.make(fit=True)
    img = qr.make_image(fill_color="black", back_color="white")
    buffer = io.BytesIO()
    img.save(buffer, format="PNG")
    buffer.seek(0)
    img_base64 = base64.b64encode(buffer.getvalue()).decode()
    data = {
        "qr_code": f"data:image/png;base64,{img_base64}",
        "qr_payload": payload,
    }
    if extra:
        data.update(extra)
    return data
