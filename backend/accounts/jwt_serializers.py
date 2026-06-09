"""
JWT login serializers with workshop activation checks.
"""
from __future__ import annotations

from rest_framework.exceptions import AuthenticationFailed
from rest_framework_simplejwt.serializers import TokenObtainPairSerializer

from .auth_utils import get_user_by_username_insensitive


class WorkshopTokenObtainPairSerializer(TokenObtainPairSerializer):
    def validate(self, attrs):
        # Username lookup is case-insensitive; password is validated as-is by Django.
        username_field = self.username_field
        user = get_user_by_username_insensitive(attrs.get(username_field, ""))
        if user is not None:
            attrs[username_field] = user.username
        data = super().validate(attrs)
        user = self.user
        tenant = getattr(user, "tenant", None)
        if tenant is not None and not tenant.is_active:
            raise AuthenticationFailed(
                "This workshop account is not active. Contact platform support.",
                code="inactive_tenant",
            )
        return data
