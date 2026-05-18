"""
Serializers for tenant (workshop) registration.

These support a simple "sign up a new workshop" flow:
- create a `WorkshopTenant` with a schema_name derived from the workshop name
- create an initial admin `User` linked to that tenant

We deliberately do **not** expose or require any domain information here, per
your requirement that tenants do not need domains.
"""
from __future__ import annotations

from typing import Any

from django.contrib.auth import get_user_model
from django.utils.text import slugify
from rest_framework import serializers

from .models import WorkshopTenant

User = get_user_model()


class TenantRegisterSerializer(serializers.Serializer):
    """
    Input payload for tenant + admin registration.

    This is intentionally minimal – you can extend it later with billing data,
    address details, etc.
    """

    workshop_name = serializers.CharField(max_length=255)

    admin_username = serializers.CharField(max_length=150)
    admin_email = serializers.EmailField()
    admin_password = serializers.CharField(write_only=True, min_length=8)
    # Honeypot — bots often fill hidden fields; humans leave empty
    website = serializers.CharField(required=False, allow_blank=True, write_only=True)

    def validate(self, attrs: dict[str, Any]) -> dict[str, Any]:
        if attrs.get("website"):
            raise serializers.ValidationError("Registration could not be completed.")
        return attrs

    def validate_admin_username(self, value: str) -> str:
        """Check that the username is not already taken."""
        if User.objects.filter(username=value).exists():
            raise serializers.ValidationError(
                f"A user with username '{value}' already exists. Please choose a different username."
            )
        return value

    def validate_admin_email(self, value: str) -> str:
        """Check that the email is not already registered."""
        if User.objects.filter(email=value).exists():
            raise serializers.ValidationError(
                f"An account with email '{value}' already exists."
            )
        return value

    def create(self, validated_data: dict[str, Any]) -> WorkshopTenant:
        """
        Create the tenant and the initial admin user.
        Must be called within the public schema context.
        """
        validated_data.pop("website", None)
        workshop_name = validated_data["workshop_name"]
        admin_username = validated_data["admin_username"]
        admin_email = validated_data["admin_email"]
        admin_password = validated_data["admin_password"]

        # Derive a schema_name from the workshop name (e.g. "Alpha Garage" -> "alpha_garage")
        base_schema = slugify(workshop_name).replace("-", "_") or "tenant"
        schema_name = base_schema
        counter = 1
        # Ensure schema_name is unique
        while WorkshopTenant.objects.filter(schema_name=schema_name).exists():
            counter += 1
            schema_name = f"{base_schema}_{counter}"

        # Create the tenant; auto_create_schema=True will create its schema
        tenant = WorkshopTenant.objects.create(
            name=workshop_name,
            schema_name=schema_name,
        )

        # Create the initial admin user in the public schema
        # (accounts app is in SHARED_APPS, so User model lives in public schema)
        admin_user = User(
            username=admin_username,
            email=admin_email,
            role=User.Role.ADMIN,  # type: ignore[attr-defined]
            tenant=tenant,
        )
        admin_user.set_password(admin_password)
        admin_user.save()

        return tenant


class WorkshopTenantAdminSerializer(serializers.ModelSerializer):
    """
    Serializer used by Superadmin users to manage tenants.

    Exposes core workshop fields plus schema-related metadata, but keeps the
    UUID `id` read-only to avoid accidental changes.
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
            "created_on",
        ]
        read_only_fields = ["id", "schema_name", "created_on"]


