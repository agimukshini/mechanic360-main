"""
JWT authentication via httpOnly cookies (with Authorization header fallback).
"""
from __future__ import annotations

from django.conf import settings
from rest_framework_simplejwt.authentication import JWTAuthentication
from rest_framework_simplejwt.exceptions import InvalidToken


class CookieJWTAuthentication(JWTAuthentication):
    """
    Prefer access token from httpOnly cookie; fall back to Authorization header.
    """

    def authenticate(self, request):
        cookie_name = getattr(settings, "JWT_AUTH_COOKIE", "access_token")
        raw_token = request.COOKIES.get(cookie_name)

        if raw_token:
            try:
                validated_token = self.get_validated_token(raw_token)
                return self.get_user(validated_token), validated_token
            except InvalidToken:
                pass

        return super().authenticate(request)


def set_auth_cookies(response, access: str, refresh: str | None = None) -> None:
    """Attach JWT access (and optional refresh) as httpOnly cookies."""
    access_lifetime = int(settings.SIMPLE_JWT["ACCESS_TOKEN_LIFETIME"].total_seconds())
    response.set_cookie(
        settings.JWT_AUTH_COOKIE,
        access,
        max_age=access_lifetime,
        httponly=settings.JWT_AUTH_COOKIE_HTTPONLY,
        secure=settings.JWT_AUTH_COOKIE_SECURE,
        samesite=settings.JWT_AUTH_COOKIE_SAMESITE,
        path=settings.JWT_AUTH_COOKIE_PATH,
    )
    if refresh:
        refresh_lifetime = int(settings.SIMPLE_JWT["REFRESH_TOKEN_LIFETIME"].total_seconds())
        response.set_cookie(
            settings.JWT_AUTH_REFRESH_COOKIE,
            refresh,
            max_age=refresh_lifetime,
            httponly=settings.JWT_AUTH_COOKIE_HTTPONLY,
            secure=settings.JWT_AUTH_COOKIE_SECURE,
            samesite=settings.JWT_AUTH_COOKIE_SAMESITE,
            path=settings.JWT_AUTH_COOKIE_PATH,
        )


def clear_auth_cookies(response) -> None:
    response.delete_cookie(
        settings.JWT_AUTH_COOKIE,
        path=settings.JWT_AUTH_COOKIE_PATH,
        samesite=settings.JWT_AUTH_COOKIE_SAMESITE,
    )
    response.delete_cookie(
        settings.JWT_AUTH_REFRESH_COOKIE,
        path=settings.JWT_AUTH_COOKIE_PATH,
        samesite=settings.JWT_AUTH_COOKIE_SAMESITE,
    )
