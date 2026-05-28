"""
Custom middleware for tenant resolution via JWT authentication.

Since we don't use domain-based routing for API requests, we resolve the tenant
from the authenticated user's `tenant` field and switch the PostgreSQL schema.
"""
from __future__ import annotations

import logging

from django.conf import settings
from django.db import connection
from django.http import HttpRequest, HttpResponse
from rest_framework_simplejwt.authentication import JWTAuthentication

logger = logging.getLogger(__name__)


class TenantUserMiddleware:
    """
    Resolves the tenant from the authenticated user and switches the DB schema.

    For API requests, this extracts the user from the JWT token and sets
    connection.schema to the user's tenant schema.

    For public schema endpoints (auth, tenant registration), it leaves the
    schema as-is (public).
    """

    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request: HttpRequest) -> HttpResponse:
        # Only process API requests
        if not request.path.startswith("/api/v1/"):
            return self.get_response(request)

        # Public endpoints that should stay in public schema
        public_paths = [
            "/api/v1/auth/",
            "/api/v1/tenants/",
            "/api/v1/global-vehicles/",
            "/api/v1/owner/",
        ]
        if any(request.path.startswith(p) for p in public_paths):
            return self.get_response(request)

        # Extract user from JWT token
        auth_header = request.META.get("HTTP_AUTHORIZATION", "")
        cookie_name = getattr(settings, "JWT_AUTH_COOKIE", "access_token")
        token = None
        if auth_header.startswith("Bearer "):
            token = auth_header[7:]
        elif request.COOKIES.get(cookie_name):
            token = request.COOKIES.get(cookie_name)

        if token:
            try:
                jwt_auth = JWTAuthentication()
                validated_token = jwt_auth.get_validated_token(token)
                user = jwt_auth.get_user(validated_token)

                if user and user.is_authenticated and user.tenant:
                    connection.set_schema(user.tenant.schema_name)
                else:
                    # Stay on public — tenant APIs will 403 via IsTenantUser
                    connection.set_schema("public")
            except Exception as exc:
                logger.debug("JWT tenant resolution failed: %s", exc)
                connection.set_schema("public")
        else:
            connection.set_schema("public")

        try:
            response = self.get_response(request)
            return response
        finally:
            # Always reset to public schema after request
            connection.set_schema("public")
