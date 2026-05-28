"""
Serializers for tenant (workshop) registration and superadmin management.
"""
from __future__ import annotations

from typing import Any

from django.contrib.auth import get_user_model
from rest_framework import serializers

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
    address = serializers.CharField(required=False, allow_blank=True, default="")
    contact_email = serializers.EmailField(required=False, allow_blank=True, default="")
    contact_phone = serializers.CharField(required=False, allow_blank=True, max_length=64, default="")

    admin_username = serializers.CharField(max_length=150)
    admin_email = serializers.EmailField()
    admin_password = serializers.CharField(write_only=True, min_length=8)
    website = serializers.CharField(required=False, allow_blank=True, write_only=True)

    def validate(self, attrs: dict[str, Any]) -> dict[str, Any]:
        if attrs.get("website"):
            raise serializers.ValidationError("Registration could not be completed.")
        _assert_username_available(attrs["admin_username"])
        _assert_email_available(attrs["admin_email"])
        return attrs

    def create(self, validated_data: dict[str, Any]) -> TenantOnboardingApplication:
        validated_data.pop("website", None)
        admin_password = validated_data.pop("admin_password")

        return TenantOnboardingApplication.objects.create(
            workshop_name=validated_data["workshop_name"],
            address=validated_data.get("address", ""),
            contact_email=validated_data.get("contact_email", ""),
            contact_phone=validated_data.get("contact_phone", ""),
            admin_username=validated_data["admin_username"],
            admin_email=validated_data["admin_email"],
            admin_password_hash=hash_admin_password(admin_password),
            status=TenantOnboardingApplication.Status.PENDING,
        )


class TenantOnboardingApplicationSerializer(serializers.ModelSerializer):
    """Superadmin view of onboarding applications."""

    reviewed_by_username = serializers.CharField(
        source="reviewed_by.username",
        read_only=True,
        default=None,
    )
    tenant_id = serializers.UUIDField(source="tenant.id", read_only=True, default=None)
    tenant_schema_name = serializers.CharField(
        source="tenant.schema_name",
        read_only=True,
        default=None,
    )

    class Meta:
        model = TenantOnboardingApplication
        fields = [
            "id",
            "workshop_name",
            "address",
            "contact_email",
            "contact_phone",
            "admin_username",
            "admin_email",
            "status",
            "rejection_reason",
            "tenant_id",
            "tenant_schema_name",
            "reviewed_by_username",
            "reviewed_at",
            "created_at",
            "updated_at",
        ]
        read_only_fields = fields


class TenantOnboardingRejectSerializer(serializers.Serializer):
    reason = serializers.CharField(required=False, allow_blank=True, max_length=2000)


class WorkshopTenantAdminSerializer(serializers.ModelSerializer):
    """
    Serializer used by Superadmin users to manage tenants.
    """

    class Meta:
        model = WorkshopTenant
        fields = [
            "id",
            "name",
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
