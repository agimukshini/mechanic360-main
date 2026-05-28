"""Workshop mechanic attribution for visit line items."""
from __future__ import annotations

from django.contrib.auth import get_user_model
from rest_framework import serializers

from mechanic360.permissions import STAFF_ROLES

User = get_user_model()


def tenant_mechanics_queryset(tenant_id):
    if not tenant_id:
        return User.objects.none()
    return User.objects.filter(
        tenant_id=tenant_id,
        role=User.Role.MECHANIC,
        is_active=True,
    )


def default_performed_by_user(request):
    user = getattr(request, "user", None)
    if user and user.is_authenticated and getattr(user, "role", None) == User.Role.MECHANIC:
        return user
    return None


def apply_performed_by_to_validated_data(serializer, validated_data: dict) -> dict:
    """
    Resolve performed_by from performed_by_id or default for mechanics on create.

    - Admins/advisors may assign any active workshop mechanic or clear attribution.
    - Mechanics default to themselves on create; cannot assign another mechanic.
    """
    request = serializer.context.get("request")
    user = getattr(request, "user", None)
    tenant_id = getattr(user, "tenant_id", None)
    mechanics = tenant_mechanics_queryset(tenant_id)

    raw = validated_data.pop("performed_by_id", serializers.empty)
    if raw is serializers.empty:
        if serializer.instance is None:
            default_user = default_performed_by_user(request)
            if default_user is not None:
                validated_data["performed_by"] = default_user
        return validated_data

    if raw in ("", None):
        if user and getattr(user, "role", None) not in STAFF_ROLES:
            raise serializers.ValidationError(
                {"performed_by_id": "Only admins and service advisors can clear mechanic attribution."}
            )
        validated_data["performed_by"] = None
        return validated_data

    if user and getattr(user, "role", None) not in STAFF_ROLES:
        if str(user.id) != str(raw):
            raise serializers.ValidationError(
                {"performed_by_id": "Mechanics can only attribute work to themselves."}
            )
        validated_data["performed_by"] = user
        return validated_data

    try:
        mechanic = mechanics.get(pk=raw)
    except (User.DoesNotExist, ValueError, TypeError) as exc:
        raise serializers.ValidationError(
            {"performed_by_id": "Invalid mechanic for this workshop."}
        ) from exc

    validated_data["performed_by"] = mechanic
    return validated_data
