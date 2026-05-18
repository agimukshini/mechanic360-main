"""
DRF serializers for authentication & user management.

These support Jira story MECH-7 (User Authentication System) by exposing:
- a basic `UserSerializer` for returning profile data
- a `RegisterSerializer` stub for future self-service sign-up
- a `SettingsSerializer` for user settings management
"""
from __future__ import annotations

from django.contrib.auth import get_user_model
from rest_framework import serializers

User = get_user_model()


class UserSerializer(serializers.ModelSerializer):
    """
    Read-only representation of a user for API responses.

    This is safe to embed in other payloads (e.g. visit created_by, inspector).
    """

    class Meta:
        model = User
        fields = ["id", "username", "email", "first_name", "last_name", "role"]
        read_only_fields = fields


class RegisterSerializer(serializers.ModelSerializer):
    """
    Tenant admin creates staff accounts for their workshop.

    Role is limited to service advisor or mechanic; tenant is set by the view.
    """

    password = serializers.CharField(write_only=True, min_length=8)
    role = serializers.ChoiceField(
        choices=[
            (User.Role.SERVICE_ADVISOR, User.Role.SERVICE_ADVISOR.label),
            (User.Role.MECHANIC, User.Role.MECHANIC.label),
        ],
        default=User.Role.MECHANIC,
    )

    class Meta:
        model = User
        fields = ["id", "username", "email", "first_name", "last_name", "role", "password"]
        read_only_fields = ["id"]

    def create(self, validated_data):
        password = validated_data.pop("password")
        tenant = self.context.get("tenant")
        user = User(**validated_data)
        if tenant is not None:
            user.tenant = tenant
        user.set_password(password)
        user.save()
        return user


class TenantUserManageSerializer(serializers.ModelSerializer):
    """
    Serializer for tenant admins to manage workshop users (mechanics, advisors, etc.).

    - Uses UUID `id` as read-only primary key
    - Accepts a plain-text password which is hashed on create/update
    - Tenant is never exposed or writable from the API; it is inferred from the
      currently authenticated admin user in the viewset.
    """

    password = serializers.CharField(write_only=True, min_length=8, required=False)

    class Meta:
        model = User
        fields = ["id", "username", "email", "first_name", "last_name", "role", "password"]
        read_only_fields = ["id"]

    def create(self, validated_data):
        """
        Create a new tenant user with a hashed password.
        Tenant will be set explicitly in the view.
        """
        password = validated_data.pop("password", None)
        user = User(**validated_data)
        if password:
            user.set_password(password)
        user.save()
        return user

    def update(self, instance, validated_data):
        """
        Update basic user fields; if `password` is provided, re-hash it.
        """
        password = validated_data.pop("password", None)
        for attr, value in validated_data.items():
            setattr(instance, attr, value)

        if password:
            instance.set_password(password)

        instance.save()
        return instance


class SettingsSerializer(serializers.ModelSerializer):
    """
    Serializer for user settings management.

    Handles profile updates and password changes.
    """

    password = serializers.CharField(write_only=True, required=False, min_length=8)
    current_password = serializers.CharField(write_only=True, required=False)
    confirm_password = serializers.CharField(write_only=True, required=False)
    quick_pin = serializers.CharField(write_only=True, required=False, min_length=4, max_length=6)
    confirm_quick_pin = serializers.CharField(write_only=True, required=False)
    has_quick_pin = serializers.SerializerMethodField()

    # Workshop settings (stored in tenant profile)
    workshop_name = serializers.SerializerMethodField()
    workshop_address = serializers.SerializerMethodField()
    workshop_phone = serializers.SerializerMethodField()
    workshop_email = serializers.SerializerMethodField()

    # Preferences - stored on tenant but with fallback defaults
    theme = serializers.CharField(default='light')
    language = serializers.CharField(default='sq')
    currency = serializers.CharField(default='EUR')
    email_notifications = serializers.BooleanField(default=True)
    sms_notifications = serializers.BooleanField(default=False)
    whatsapp_notifications = serializers.BooleanField(default=False)

    class Meta:
        model = User
        fields = [
            "id", "username", "email", "first_name", "last_name", "role",
            "password", "current_password", "confirm_password",
            "quick_pin", "confirm_quick_pin", "has_quick_pin",
            "workshop_name", "workshop_address", "workshop_phone", "workshop_email",
            "theme", "language", "currency",
            "email_notifications", "sms_notifications", "whatsapp_notifications",
        ]
        read_only_fields = ["id", "username", "role"]

    def get_workshop_name(self, obj):
        return obj.tenant.name if obj.tenant else ''

    def get_workshop_address(self, obj):
        return obj.tenant.address if obj.tenant else ''

    def get_workshop_phone(self, obj):
        return obj.tenant.contact_phone if obj.tenant else ''

    def get_workshop_email(self, obj):
        return obj.tenant.contact_email if obj.tenant else ''

    def get_has_quick_pin(self, obj):
        return obj.has_quick_pin

    def to_representation(self, instance):
        """Add tenant values to the response."""
        data = super().to_representation(instance)
        if instance.tenant:
            data['language'] = instance.tenant.language or 'sq'
            data['currency'] = instance.tenant.currency or 'EUR'
        return data

    def validate(self, data):
        """
        Validate password change fields.
        """
        if data.get('password'):
            if not data.get('current_password'):
                raise serializers.ValidationError({
                    'current_password': 'Current password is required to change password.'
                })

            # Verify current password
            user = self.instance
            if not user.check_password(data['current_password']):
                raise serializers.ValidationError({
                    'current_password': 'Current password is incorrect.'
                })

            # Check confirm password matches
            if data.get('password') != data.get('confirm_password'):
                raise serializers.ValidationError({
                    'confirm_password': 'Passwords do not match.'
                })

        quick_pin = data.get('quick_pin')
        if quick_pin is not None and quick_pin != '':
            if not quick_pin.isdigit():
                raise serializers.ValidationError({
                    'quick_pin': 'PIN must contain only digits.'
                })
            if not data.get('current_password'):
                raise serializers.ValidationError({
                    'current_password': 'Current password is required to set a PIN.'
                })
            user = self.instance
            if not user.check_password(data['current_password']):
                raise serializers.ValidationError({
                    'current_password': 'Current password is incorrect.'
                })
            if quick_pin != data.get('confirm_quick_pin'):
                raise serializers.ValidationError({
                    'confirm_quick_pin': 'PINs do not match.'
                })

        return data

    def create(self, validated_data):
        """
        Settings are not created via API.
        """
        raise NotImplementedError("Use update instead.")

    def update(self, instance, validated_data):
        """
        Update user settings including password change.
        """
        # Handle password change
        password = validated_data.pop('password', None)
        validated_data.pop('current_password', None)
        validated_data.pop('confirm_password', None)
        quick_pin = validated_data.pop('quick_pin', None)
        validated_data.pop('confirm_quick_pin', None)

        # Extract tenant-related fields
        language = validated_data.pop('language', None)
        currency = validated_data.pop('currency', None)
        workshop_address = validated_data.pop('workshop_address', None)
        workshop_phone = validated_data.pop('workshop_phone', None)
        workshop_email = validated_data.pop('workshop_email', None)

        # Update user fields
        for attr, value in validated_data.items():
            setattr(instance, attr, value)

        if password:
            instance.set_password(password)

        if quick_pin:
            instance.set_quick_pin(quick_pin)

        instance.save()

        # Update tenant fields if tenant exists
        if instance.tenant:
            if language is not None:
                instance.tenant.language = language
            if currency is not None:
                instance.tenant.currency = currency
            if workshop_address is not None:
                instance.tenant.address = workshop_address
            if workshop_phone is not None:
                instance.tenant.contact_phone = workshop_phone
            if workshop_email is not None:
                instance.tenant.contact_email = workshop_email
            instance.tenant.save()

        return instance


