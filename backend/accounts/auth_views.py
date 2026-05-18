"""
JWT token views with rate limiting and httpOnly cookie support.
"""
from __future__ import annotations

from django.conf import settings
from rest_framework import status
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework_simplejwt.exceptions import TokenError
from rest_framework_simplejwt.serializers import TokenRefreshSerializer
from rest_framework_simplejwt.views import TokenObtainPairView, TokenRefreshView

from mechanic360.throttling import AuthAnonRateThrottle

from .cookie_auth import clear_auth_cookies, set_auth_cookies


class ThrottledTokenObtainPairView(TokenObtainPairView):
    throttle_classes = [AuthAnonRateThrottle]

    def post(self, request, *args, **kwargs):
        response = super().post(request, *args, **kwargs)
        if response.status_code == 200:
            access = response.data.get("access")
            refresh = response.data.get("refresh")
            if access:
                set_auth_cookies(response, access, refresh)
        return response


class ThrottledTokenRefreshView(TokenRefreshView):
    throttle_classes = [AuthAnonRateThrottle]

    def post(self, request, *args, **kwargs):
        refresh = request.COOKIES.get(settings.JWT_AUTH_REFRESH_COOKIE)
        body_refresh = request.data.get("refresh") if request.data else None
        if refresh and not body_refresh:
            serializer = TokenRefreshSerializer(data={"refresh": refresh})
            serializer.is_valid(raise_exception=True)
            tokens = serializer.validated_data
            response = Response(tokens, status=status.HTTP_200_OK)
            access = tokens.get("access")
            new_refresh = tokens.get("refresh")
            if access:
                set_auth_cookies(response, access, new_refresh)
            return response
        response = super().post(request, *args, **kwargs)
        if response.status_code == 200 and response.data.get("access"):
            set_auth_cookies(
                response,
                response.data["access"],
                response.data.get("refresh"),
            )
        return response


class LogoutView(APIView):
    """Clear JWT cookies (client should also discard any in-memory state)."""

    permission_classes = [AllowAny]

    def post(self, request, *args, **kwargs):
        response = Response({"detail": "Successfully logged out."}, status=status.HTTP_200_OK)
        clear_auth_cookies(response)
        return response
