"""
JWT login serializers with workshop activation checks.
"""
from __future__ import annotations

from rest_framework.exceptions import AuthenticationFailed
from rest_framework_simplejwt.serializers import TokenObtainPairSerializer


class WorkshopTokenObtainPairSerializer(TokenObtainPairSerializer):
    def validate(self, attrs):
        data = super().validate(attrs)
        user = self.user
        tenant = getattr(user, "tenant", None)
        if tenant is not None and not tenant.is_active:
            raise AuthenticationFailed(
                "This workshop account is not active. Contact platform support.",
                code="inactive_tenant",
            )
        return data
