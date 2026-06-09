"""
Quick PIN login — username + numeric PIN issues JWT cookies like password login.
"""
from __future__ import annotations

from django.contrib.auth import get_user_model
from rest_framework import serializers, status
from rest_framework.exceptions import AuthenticationFailed
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework_simplejwt.tokens import RefreshToken

from mechanic360.throttling import AuthAnonRateThrottle

from .auth_utils import get_user_by_username_insensitive
from .cookie_auth import set_auth_cookies
from .login_audit import classify_pin_failure, is_inactive_tenant_message, record_login_attempt
from .login_audit_models import LoginAuditEvent

User = get_user_model()


class PinLoginSerializer(serializers.Serializer):
    username = serializers.CharField()
    pin = serializers.CharField(min_length=4, max_length=6)

    def validate_pin(self, value: str) -> str:
        if not value.isdigit():
            raise serializers.ValidationError("PIN must contain only digits.")
        return value

    def validate(self, attrs):
        username = attrs["username"].strip()
        user = get_user_by_username_insensitive(username)
        if user is None:
            raise AuthenticationFailed("Invalid username or PIN.", code="authorization")

        if not user.is_active:
            raise AuthenticationFailed("Invalid username or PIN.", code="authorization")

        tenant = getattr(user, "tenant", None)
        if tenant is not None and not tenant.is_active:
            raise AuthenticationFailed(
                "This workshop account is not active. Contact platform support.",
                code="inactive_tenant",
            )

        if not user.has_quick_pin or not user.check_quick_pin(attrs["pin"]):
            raise AuthenticationFailed("Invalid username or PIN.", code="authorization")

        attrs["user"] = user
        return attrs


class ThrottledPinTokenObtainView(APIView):
    """POST { username, pin } -> JWT access/refresh (httpOnly cookies set)."""

    permission_classes = [AllowAny]
    throttle_classes = [AuthAnonRateThrottle]

    def post(self, request, *args, **kwargs):
        username = str(request.data.get("username", "")).strip() if request.data else ""
        serializer = PinLoginSerializer(data=request.data)

        try:
            serializer.is_valid(raise_exception=True)
        except AuthenticationFailed as exc:
            user = get_user_by_username_insensitive(username)
            detail = exc.detail if hasattr(exc, "detail") else str(exc)
            if is_inactive_tenant_message(detail):
                outcome = LoginAuditEvent.Outcome.FAILED_TENANT_INACTIVE
            else:
                outcome = classify_pin_failure(username)
            record_login_attempt(
                request,
                username_attempted=username,
                outcome=outcome,
                auth_method=LoginAuditEvent.AuthMethod.PIN,
                user=user,
            )
            raise

        user = serializer.validated_data["user"]
        record_login_attempt(
            request,
            username_attempted=username or user.username,
            outcome=LoginAuditEvent.Outcome.SUCCESS,
            auth_method=LoginAuditEvent.AuthMethod.PIN,
            user=user,
        )

        refresh = RefreshToken.for_user(user)
        access = str(refresh.access_token)
        response = Response(
            {"access": access, "refresh": str(refresh)},
            status=status.HTTP_200_OK,
        )
        set_auth_cookies(response, access, str(refresh))
        return response
