"""
API views for tenant (workshop) management.

Includes:
- public registration endpoint to onboard a new workshop + initial admin user
- Superadmin-only CRUD viewset for managing tenants (MECH-9)
"""
from __future__ import annotations

from contextlib import contextmanager

from django.db import connection
from django.conf import settings
from rest_framework import permissions, status, viewsets
from rest_framework.response import Response
from rest_framework.views import APIView

from mechanic360.throttling import RegistrationAnonRateThrottle

from .models import WorkshopTenant
from .serializers import TenantRegisterSerializer, WorkshopTenantAdminSerializer


@contextmanager
def public_schema():
    """
    Context manager to temporarily switch to the public schema.
    """
    old_schema = connection.schema_name
    connection.set_schema("public")
    try:
        yield
    finally:
        connection.set_schema(old_schema)


class TenantRegisterView(APIView):
    """
    Public endpoint to register a new tenant (workshop).

    In production you would likely:
    - add rate limiting / CAPTCHA
    - require email verification
    - integrate billing
    """

    permission_classes = [permissions.AllowAny]
    throttle_classes = [RegistrationAnonRateThrottle]

    def post(self, request, *args, **kwargs):
        serializer = TenantRegisterSerializer(data=request.data)
        if not serializer.is_valid():
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

        # Force public schema for tenant creation
        with public_schema():
            tenant = serializer.save()

        return Response(
            {
                "id": str(tenant.id),
                "name": tenant.name,
                "schema_name": tenant.schema_name,
            },
            status=status.HTTP_201_CREATED,
        )


class IsSuperAdmin(permissions.BasePermission):
    """
    Restricts access to Django superusers (global Superadmin).

    This is used for tenant CRUD so only platform-level operators can create,
    update or deactivate workshops centrally.
    """

    def has_permission(self, request, view) -> bool:
        user = request.user
        return bool(user and user.is_authenticated and user.is_superuser)


class WorkshopTenantAdminViewSet(viewsets.ModelViewSet):
    """
    Superadmin-only CRUD over WorkshopTenant records.

    This runs in the public schema and lets the platform operator:
    - list all tenants
    - inspect a tenant's contact & subscription info
    - toggle `is_active`
    - update branding details (logo, address, contact)
    """

    queryset = WorkshopTenant.objects.all().order_by("name")
    serializer_class = WorkshopTenantAdminSerializer
    permission_classes = [IsSuperAdmin]


