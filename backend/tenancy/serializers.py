"""
Serializers for tenant (workshop) registration and superadmin management.
"""
from __future__ import annotations

from typing import Any

from django.contrib.auth import get_user_model
from rest_framework import serializers

from .kyc import (
    assert_nui_available,
    generate_verification_code,
    normalize_nui,
    validate_nui_format,
)
from .models import TenantOnboardingApplication, WorkshopTenant
from .onboarding import (
    _assert_email_available,
    _assert_username_available,
    hash_admin_password,
)

User = get_user_model()


class TenantRegisterSerializer(serializers.Serializer):
    """
    Public workshop signup — creates a pending onboarding application.
    """

    workshop_name = serializers.CharField(max_length=255)
    business_registration_number = serializers.CharField(max_length=32)
    address = serializers.CharField(max_length=2000)
    contact_email = serializers.EmailField()
    contact_phone = serializers.CharField(max_length=64)

    admin_username = serializers.CharField(max_length=150)
    admin_email = serializers.EmailField()
    admin_password = serializers.CharField(write_only=True, min_length=8)
    website = serializers.CharField(required=False, allow_blank=True, write_only=True)

    def validate_business_registration_number(self, value: str) -> str:
        return validate_nui_format(value)

    def validate_workshop_name(self, value: str) -> str:
        cleaned = value.strip()
        if len(cleaned) < 2:
            raise serializers.ValidationError("Enter the official business name as registered with ARBK.")
        return cleaned

    def validate_address(self, value: str) -> str:
        cleaned = value.strip()
        if len(cleaned) < 5:
            raise serializers.ValidationError("Enter the registered business address from ARBK.")
        return cleaned

    def validate_contact_email(self, value: str) -> str:
        cleaned = value.strip()
        if not cleaned:
            raise serializers.ValidationError("Official business email is required.")
        return cleaned

    def validate_contact_phone(self, value: str) -> str:
        cleaned = value.strip()
        if len(cleaned) < 6:
            raise serializers.ValidationError("Official business phone is required.")
        return cleaned

    def validate(self, attrs: dict[str, Any]) -> dict[str, Any]:
        if attrs.get("website"):
            raise serializers.ValidationError("Registration could not be completed.")
        _assert_username_available(attrs["admin_username"])
        _assert_email_available(attrs["admin_email"])
        assert_nui_available(attrs["business_registration_number"])
        return attrs

    def create(self, validated_data: dict[str, Any]) -> TenantOnboardingApplication:
        validated_data.pop("website", None)
        admin_password = validated_data.pop("admin_password")
        nui = normalize_nui(validated_data["business_registration_number"])

        return TenantOnboardingApplication.objects.create(
            workshop_name=validated_data["workshop_name"],
            business_registration_number=nui,
            address=validated_data["address"],
            contact_email=validated_data["contact_email"],
            contact_phone=validated_data["contact_phone"],
            admin_username=validated_data["admin_username"],
            admin_email=validated_data["admin_email"],
            admin_password_hash=hash_admin_password(admin_password),
            verification_code=generate_verification_code(),
            status=TenantOnboardingApplication.Status.PENDING,
        )


class TenantOnboardingApplicationSerializer(serializers.ModelSerializer):
    """Superadmin view of onboarding applications."""

    reviewed_by_username = serializers.CharField(
        source="reviewed_by.username",
        read_only=True,
        default=None,
    )
    verification_code_confirmed_by_username = serializers.CharField(
        source="verification_code_confirmed_by.username",
        read_only=True,
        default=None,
    )
    tenant_id = serializers.UUIDField(source="tenant.id", read_only=True, default=None)
    tenant_schema_name = serializers.CharField(
        source="tenant.schema_name",
        read_only=True,
        default=None,
    )
    verification_link_clicked_at = serializers.SerializerMethodField()
    verification_link_click_ip = serializers.SerializerMethodField()
    verification_link_click_user_agent = serializers.SerializerMethodField()

    class Meta:
        model = TenantOnboardingApplication
        fields = [
            "id",
            "workshop_name",
            "business_registration_number",
            "address",
            "contact_email",
            "contact_phone",
            "verification_code",
            "verification_code_confirmed_at",
            "verification_code_confirmed_by_username",
            "verification_code_channel",
            "verification_code_note",
            "admin_username",
            "admin_email",
            "status",
            "rejection_reason",
            "tenant_id",
            "tenant_schema_name",
            "verification_link_clicked_at",
            "verification_link_click_ip",
            "verification_link_click_user_agent",
            "reviewed_by_username",
            "reviewed_at",
            "created_at",
            "updated_at",
        ]
        read_only_fields = fields

    def _latest_verification_click(self, obj):
        return (
            obj.verification_tokens.filter(clicked_at__isnull=False)
            .order_by("-clicked_at")
            .first()
        )

    def get_verification_link_clicked_at(self, obj):
        token = self._latest_verification_click(obj)
        return token.clicked_at if token else None

    def get_verification_link_click_ip(self, obj):
        token = self._latest_verification_click(obj)
        return token.click_ip if token else ""

    def get_verification_link_click_user_agent(self, obj):
        token = self._latest_verification_click(obj)
        return token.click_user_agent if token else ""


class TenantOnboardingRejectSerializer(serializers.Serializer):
    reason = serializers.CharField(required=False, allow_blank=True, max_length=2000)


class TenantOnboardingConfirmVerificationSerializer(serializers.Serializer):
    channel = serializers.ChoiceField(
        choices=TenantOnboardingApplication.VerificationChannel.choices,
    )
    note = serializers.CharField(required=False, allow_blank=True, max_length=2000)


class TenantOnboardingApproveSerializer(serializers.Serializer):
    verification_note = serializers.CharField(required=False, allow_blank=True, max_length=2000)


class WorkshopTenantAdminSerializer(serializers.ModelSerializer):
    """
    Serializer used by Superadmin users to manage tenants.
    """

    class Meta:
        model = WorkshopTenant
        fields = [
            "id",
            "name",
            "business_registration_number",
            "schema_name",
            "logo_url",
            "address",
            "contact_email",
            "contact_phone",
            "subscription_plan",
            "is_active",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["id", "schema_name", "created_at", "updated_at"]
