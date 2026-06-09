"""
JWT token views with rate limiting and httpOnly cookie support.
"""
from __future__ import annotations

from django.conf import settings
from django.contrib.auth import get_user_model
from rest_framework import status
from rest_framework.exceptions import APIException
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework_simplejwt.exceptions import TokenError
from rest_framework_simplejwt.serializers import TokenRefreshSerializer
from rest_framework_simplejwt.tokens import RefreshToken
from rest_framework_simplejwt.views import TokenObtainPairView, TokenRefreshView

from mechanic360.throttling import AuthAnonRateThrottle

from .auth_utils import get_user_by_username_insensitive
from .cookie_auth import clear_auth_cookies, set_auth_cookies
from .jwt_serializers import WorkshopTokenObtainPairSerializer
from .login_audit import (
    classify_password_failure,
    is_inactive_tenant_message,
    record_login_attempt,
)
from .login_audit_models import LoginAuditEvent

User = get_user_model()


def _response_detail(response) -> object:
    data = getattr(response, "data", None)
    if isinstance(data, dict):
        return data.get("detail", "")
    return ""


def _log_password_login(
    request,
    username: str,
    *,
    success: bool,
    detail: object = "",
) -> None:
    if not username:
        return
    user = get_user_by_username_insensitive(username)
    if success:
        outcome = LoginAuditEvent.Outcome.SUCCESS
    elif is_inactive_tenant_message(detail):
        outcome = LoginAuditEvent.Outcome.FAILED_TENANT_INACTIVE
    else:
        outcome = classify_password_failure(username)
    record_login_attempt(
        request,
        username_attempted=username,
        outcome=outcome,
        auth_method=LoginAuditEvent.AuthMethod.PASSWORD,
        user=user,
    )


class ThrottledTokenObtainPairView(TokenObtainPairView):
    throttle_classes = [AuthAnonRateThrottle]
    serializer_class = WorkshopTokenObtainPairSerializer

    def post(self, request, *args, **kwargs):
        username = str(request.data.get("username", "")).strip() if request.data else ""
        try:
            response = super().post(request, *args, **kwargs)
        except APIException as exc:
            _log_password_login(request, username, success=False, detail=exc.detail)
            raise

        if response.status_code == 200:
            _log_password_login(request, username, success=True)
            access = response.data.get("access")
            refresh = response.data.get("refresh")
            if access:
                set_auth_cookies(response, access, refresh)
        elif username:
            _log_password_login(
                request,
                username,
                success=False,
                detail=_response_detail(response),
            )
        return response


class ThrottledTokenRefreshView(TokenRefreshView):
    throttle_classes = [AuthAnonRateThrottle]

    def post(self, request, *args, **kwargs):
        refresh = request.COOKIES.get(settings.JWT_AUTH_REFRESH_COOKIE)
        body_refresh = request.data.get("refresh") if request.data else None
        token_value = refresh or body_refresh

        try:
            if refresh and not body_refresh:
                serializer = TokenRefreshSerializer(data={"refresh": refresh})
                serializer.is_valid(raise_exception=True)
                tokens = serializer.validated_data
                response = Response(tokens, status=status.HTTP_200_OK)
                access = tokens.get("access")
                new_refresh = tokens.get("refresh")
                if access:
                    set_auth_cookies(response, access, new_refresh)
                self._log_refresh_success(request, token_value or refresh)
                return response
            response = super().post(request, *args, **kwargs)
            if response.status_code == 200 and response.data.get("access"):
                set_auth_cookies(
                    response,
                    response.data["access"],
                    response.data.get("refresh"),
                )
                self._log_refresh_success(request, token_value)
            elif token_value:
                self._log_refresh_failure(request, token_value)
            return response
        except TokenError:
            if token_value:
                self._log_refresh_failure(request, token_value)
            response = Response(
                {"detail": "Token is invalid or expired."},
                status=status.HTTP_401_UNAUTHORIZED,
            )
            clear_auth_cookies(response)
            return response

    def _user_from_refresh(self, raw_token: str | None):
        if not raw_token:
            return None
        try:
            token = RefreshToken(raw_token)
            user_id = token.payload.get("user_id")
            if user_id:
                return User.objects.filter(pk=user_id).first()
        except TokenError:
            return None
        return None

    def _log_refresh_success(self, request, raw_token: str | None) -> None:
        user = self._user_from_refresh(raw_token)
        username = user.username if user else ""
        record_login_attempt(
            request,
            username_attempted=username,
            outcome=LoginAuditEvent.Outcome.SUCCESS,
            auth_method=LoginAuditEvent.AuthMethod.REFRESH,
            user=user,
        )

    def _log_refresh_failure(self, request, raw_token: str | None) -> None:
        user = self._user_from_refresh(raw_token)
        username = user.username if user else "unknown"
        record_login_attempt(
            request,
            username_attempted=username,
            outcome=LoginAuditEvent.Outcome.FAILED_PASSWORD,
            auth_method=LoginAuditEvent.AuthMethod.REFRESH,
            user=user,
        )


class LogoutView(APIView):
    """Clear JWT cookies (client should also discard any in-memory state)."""

    permission_classes = [AllowAny]

    def post(self, request, *args, **kwargs):
        response = Response({"detail": "Successfully logged out."}, status=status.HTTP_200_OK)
        clear_auth_cookies(response)
        return response
