"""API serializers for staff invite links."""
from __future__ import annotations

from django.contrib.auth import get_user_model
from rest_framework import serializers

from .invite_models import StaffInviteToken

User = get_user_model()


class StaffInviteCreateSerializer(serializers.Serializer):
    email = serializers.EmailField(required=False, allow_blank=True)
    first_name = serializers.CharField(required=False, allow_blank=True, max_length=150)
    last_name = serializers.CharField(required=False, allow_blank=True, max_length=150)
    role = serializers.ChoiceField(
        choices=[
            (User.Role.MECHANIC, User.Role.MECHANIC),
        ],
        default=User.Role.MECHANIC,
    )


class StaffInviteTokenSerializer(serializers.ModelSerializer):
    status = serializers.SerializerMethodField()
    invite_url = serializers.SerializerMethodField()
    workshop_name = serializers.CharField(source="tenant.name", read_only=True)

    class Meta:
        model = StaffInviteToken
        fields = [
            "id",
            "workshop_name",
            "email",
            "first_name",
            "last_name",
            "role",
            "expires_at",
            "used_at",
            "status",
            "invite_url",
            "created_at",
        ]
        read_only_fields = fields

    def get_status(self, obj: StaffInviteToken) -> str:
        from django.utils import timezone

        if obj.used_at is not None:
            return "used"
        if obj.expires_at <= timezone.now():
            return "expired"
        return "valid"

    def get_invite_url(self, obj: StaffInviteToken) -> str:
        request = self.context.get("request")
        from .invite_services import staff_invite_absolute_url

        return staff_invite_absolute_url(request, obj.id)


class StaffInviteAcceptSerializer(serializers.Serializer):
    username = serializers.CharField(max_length=150)
    password = serializers.CharField(min_length=8, write_only=True)
    email = serializers.EmailField(required=False, allow_blank=True)
    first_name = serializers.CharField(required=False, allow_blank=True, max_length=150)
    last_name = serializers.CharField(required=False, allow_blank=True, max_length=150)
