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

WORKSHOP_MEMBER_ROLES = frozenset({User.Role.ADMIN, User.Role.MECHANIC})

WORKSHOP_WRITE_FIELDS = frozenset(
    {"workshop_address", "workshop_phone", "workshop_email", "language", "currency"}
)


def user_can_edit_workshop(user) -> bool:
    return bool(
        user
        and getattr(user, "role", None) == User.Role.ADMIN
        and getattr(user, "tenant_id", None) is not None
    )


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

    Role is limited to mechanic; tenant is set by the view.
    """

    password = serializers.CharField(write_only=True, min_length=8)
    role = serializers.ChoiceField(
        choices=[
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
    Serializer for tenant admins to manage workshop users.

    Admins can promote mechanics to admin or demote admins to mechanic.
    New accounts are created as mechanics.
    """

    password = serializers.CharField(write_only=True, min_length=8, required=False)
    role = serializers.ChoiceField(
        choices=[
            (User.Role.ADMIN, User.Role.ADMIN.label),
            (User.Role.MECHANIC, User.Role.MECHANIC.label),
        ],
        default=User.Role.MECHANIC,
    )

    class Meta:
        model = User
        fields = [
            "id",
            "username",
            "email",
            "first_name",
            "last_name",
            "role",
            "is_active",
            "date_joined",
            "password",
        ]
        read_only_fields = ["id", "date_joined"]

    def validate(self, attrs):
        if self.instance is None and not attrs.get("password"):
            raise serializers.ValidationError({"password": "Password is required for new users."})

        request = self.context.get("request")
        actor = getattr(request, "user", None)
        new_role = attrs.get("role")

        if self.instance is None:
            if new_role == User.Role.ADMIN:
                raise serializers.ValidationError(
                    {"role": "New users must be created as mechanics. Promote to admin when editing."}
                )
            return attrs

        if new_role is None or actor is None:
            return attrs

        if new_role not in WORKSHOP_MEMBER_ROLES:
            raise serializers.ValidationError({"role": "Role must be admin or mechanic."})

        if self.instance.id == actor.id and new_role != self.instance.role:
            raise serializers.ValidationError({"role": "You cannot change your own role."})

        if self.instance.role == User.Role.ADMIN and new_role != User.Role.ADMIN:
            tenant = actor.tenant
            remaining_admins = User.objects.filter(
                tenant=tenant,
                role=User.Role.ADMIN,
                is_active=True,
            ).exclude(id=self.instance.id).count()
            if remaining_admins < 1:
                raise serializers.ValidationError(
                    {"role": "The workshop must keep at least one active admin."}
                )

        return attrs

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
    Workshop/tenant fields are writable only by tenant admins.
    """

    password = serializers.CharField(write_only=True, required=False, min_length=8)
    current_password = serializers.CharField(write_only=True, required=False)
    confirm_password = serializers.CharField(write_only=True, required=False)
    quick_pin = serializers.CharField(write_only=True, required=False, min_length=4, max_length=6)
    confirm_quick_pin = serializers.CharField(write_only=True, required=False)
    has_quick_pin = serializers.SerializerMethodField()
    can_edit_workshop = serializers.SerializerMethodField()

    # Workshop settings (stored in tenant profile)
    workshop_name = serializers.SerializerMethodField()
    workshop_address = serializers.CharField(required=False, allow_blank=True)
    workshop_phone = serializers.CharField(required=False, allow_blank=True)
    workshop_email = serializers.EmailField(required=False, allow_blank=True)

    # Tenant-level preferences (admin only to write)
    language = serializers.CharField(required=False)
    currency = serializers.CharField(required=False)

    class Meta:
        model = User
        fields = [
            "id",
            "username",
            "email",
            "first_name",
            "last_name",
            "phone",
            "role",
            "password",
            "current_password",
            "confirm_password",
            "quick_pin",
            "confirm_quick_pin",
            "has_quick_pin",
            "can_edit_workshop",
            "workshop_name",
            "workshop_address",
            "workshop_phone",
            "workshop_email",
            "theme",
            "language",
            "currency",
            "email_notifications",
            "sms_notifications",
            "whatsapp_notifications",
        ]
        read_only_fields = ["id", "username", "role", "can_edit_workshop", "workshop_name"]

    def get_workshop_name(self, obj):
        return obj.tenant.name if obj.tenant else ""

    def get_workshop_address(self, obj):
        return obj.tenant.address if obj.tenant else ""

    def get_workshop_phone(self, obj):
        return obj.tenant.contact_phone if obj.tenant else ""

    def get_workshop_email(self, obj):
        return obj.tenant.contact_email if obj.tenant else ""

    def get_has_quick_pin(self, obj):
        return obj.has_quick_pin

    def get_can_edit_workshop(self, obj):
        return user_can_edit_workshop(obj)

    def to_representation(self, instance):
        """Merge tenant values into the response for read."""
        data = super().to_representation(instance)
        if instance.tenant:
            data["workshop_address"] = instance.tenant.address or ""
            data["workshop_phone"] = instance.tenant.contact_phone or ""
            data["workshop_email"] = instance.tenant.contact_email or ""
            data["language"] = instance.tenant.language or "sq"
            data["currency"] = instance.tenant.currency or "EUR"
        else:
            data["workshop_address"] = ""
            data["workshop_phone"] = ""
            data["workshop_email"] = ""
            data.setdefault("language", "sq")
            data.setdefault("currency", "EUR")
        return data

    def validate(self, data):
        """Validate password/PIN changes and workshop field permissions."""
        instance = self.instance
        if instance is None:
            return data

        if not user_can_edit_workshop(instance):
            attempted = WORKSHOP_WRITE_FIELDS.intersection(data.keys())
            if attempted:
                raise serializers.ValidationError(
                    {
                        "detail": (
                            "Only workshop admins can update workshop settings."
                        )
                    }
                )

        if data.get("password"):
            if not data.get("current_password"):
                raise serializers.ValidationError(
                    {"current_password": "Current password is required to change password."}
                )
            if not instance.check_password(data["current_password"]):
                raise serializers.ValidationError(
                    {"current_password": "Current password is incorrect."}
                )
            if data.get("password") != data.get("confirm_password"):
                raise serializers.ValidationError(
                    {"confirm_password": "Passwords do not match."}
                )

        quick_pin = data.get("quick_pin")
        if quick_pin is not None and quick_pin != "":
            if not quick_pin.isdigit():
                raise serializers.ValidationError(
                    {"quick_pin": "PIN must contain only digits."}
                )
            if not data.get("current_password"):
                raise serializers.ValidationError(
                    {"current_password": "Current password is required to set a PIN."}
                )
            if not instance.check_password(data["current_password"]):
                raise serializers.ValidationError(
                    {"current_password": "Current password is incorrect."}
                )
            if quick_pin != data.get("confirm_quick_pin"):
                raise serializers.ValidationError({"confirm_quick_pin": "PINs do not match."})

        return data

    def create(self, validated_data):
        raise NotImplementedError("Use update instead.")

    def update(self, instance, validated_data):
        """Update user profile, preferences, password, and optional tenant fields."""
        password = validated_data.pop("password", None)
        validated_data.pop("current_password", None)
        validated_data.pop("confirm_password", None)
        quick_pin = validated_data.pop("quick_pin", None)
        validated_data.pop("confirm_quick_pin", None)

        language = validated_data.pop("language", None)
        currency = validated_data.pop("currency", None)
        workshop_address = validated_data.pop("workshop_address", None)
        workshop_phone = validated_data.pop("workshop_phone", None)
        workshop_email = validated_data.pop("workshop_email", None)

        user_fields = {
            "first_name",
            "last_name",
            "email",
            "phone",
            "theme",
            "email_notifications",
            "sms_notifications",
            "whatsapp_notifications",
        }
        for attr, value in validated_data.items():
            if attr in user_fields:
                setattr(instance, attr, value)

        if password:
            instance.set_password(password)

        if quick_pin:
            instance.set_quick_pin(quick_pin)

        instance.save()

        if user_can_edit_workshop(instance) and instance.tenant:
            tenant = instance.tenant
            if language is not None:
                tenant.language = language
            if currency is not None:
                tenant.currency = currency
            if workshop_address is not None:
                tenant.address = workshop_address
            if workshop_phone is not None:
                tenant.contact_phone = workshop_phone
            if workshop_email is not None:
                tenant.contact_email = workshop_email
            tenant.save()

        return instance
