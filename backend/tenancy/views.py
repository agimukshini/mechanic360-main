"""
API views for tenant (workshop) management.

Includes:
- public registration endpoint to submit a workshop onboarding application
- Superadmin-only review of onboarding applications
- Superadmin-only CRUD viewset for managing tenants (MECH-9)
"""
from __future__ import annotations

from contextlib import contextmanager

from django.db import connection
from rest_framework import permissions, status, viewsets
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.views import APIView

from mechanic360.throttling import RegistrationAnonRateThrottle

from .models import TenantOnboardingApplication, WorkshopTenant
from .onboarding import approve_onboarding_application, reject_onboarding_application
from .stats import (
    collect_dashboard_payload,
    collect_global_registry_payload,
    tenant_summary_dict,
    tenant_usage_stats_dict,
)
from .serializers import (
    TenantOnboardingApplicationSerializer,
    TenantOnboardingRejectSerializer,
    TenantRegisterSerializer,
    WorkshopTenantAdminSerializer,
)


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
    Public endpoint to submit a workshop onboarding application.

    A platform superuser must approve the request before the tenant schema
    and admin account are created.
    """

    permission_classes = [permissions.AllowAny]
    throttle_classes = [RegistrationAnonRateThrottle]

    def post(self, request, *args, **kwargs):
        serializer = TenantRegisterSerializer(data=request.data)
        if not serializer.is_valid():
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

        with public_schema():
            application = serializer.save()

        return Response(
            {
                "id": str(application.id),
                "workshop_name": application.workshop_name,
                "status": application.status,
                "message": (
                    "Your workshop application has been submitted. "
                    "You will be able to sign in once a platform administrator approves it."
                ),
            },
            status=status.HTTP_201_CREATED,
        )


class IsSuperAdmin(permissions.BasePermission):
    """
    Restricts access to Django superusers (global Superadmin).
    """

    def has_permission(self, request, view) -> bool:
        user = request.user
        return bool(user and user.is_authenticated and user.is_superuser)


class TenantOnboardingApplicationViewSet(viewsets.ReadOnlyModelViewSet):
    """
    Superadmin review queue for workshop onboarding applications.
    """

    queryset = TenantOnboardingApplication.objects.select_related(
        "tenant",
        "reviewed_by",
    ).order_by("-created_at")
    serializer_class = TenantOnboardingApplicationSerializer
    permission_classes = [IsSuperAdmin]

    def get_queryset(self):
        queryset = super().get_queryset()
        status_filter = self.request.query_params.get("status")
        if status_filter:
            queryset = queryset.filter(status=status_filter)
        return queryset

    @action(detail=True, methods=["post"])
    def approve(self, request, pk=None):
        application = self.get_object()
        with public_schema():
            tenant = approve_onboarding_application(application, request.user)
        application.refresh_from_db()
        return Response(
            {
                "application": TenantOnboardingApplicationSerializer(application).data,
                "tenant": WorkshopTenantAdminSerializer(tenant).data,
            },
            status=status.HTTP_200_OK,
        )

    @action(detail=True, methods=["post"])
    def reject(self, request, pk=None):
        application = self.get_object()
        reject_serializer = TenantOnboardingRejectSerializer(data=request.data)
        reject_serializer.is_valid(raise_exception=True)
        with public_schema():
            reject_onboarding_application(
                application,
                request.user,
                reason=reject_serializer.validated_data.get("reason", ""),
            )
        application.refresh_from_db()
        return Response(
            TenantOnboardingApplicationSerializer(application).data,
            status=status.HTTP_200_OK,
        )


class WorkshopTenantAdminViewSet(viewsets.ModelViewSet):
    """
    Superadmin-only CRUD over WorkshopTenant records.
    """

    queryset = WorkshopTenant.objects.all().order_by("name")
    serializer_class = WorkshopTenantAdminSerializer
    permission_classes = [IsSuperAdmin]

    def retrieve(self, request, *args, **kwargs):
        tenant = self.get_object()
        return Response(tenant_summary_dict(tenant))

    @action(detail=True, methods=["get"])
    def stats(self, request, pk=None):
        tenant = self.get_object()
        return Response(tenant_usage_stats_dict(tenant))


class SuperadminDashboardView(APIView):
    """Platform overview and per-tenant usage counters."""

    permission_classes = [IsSuperAdmin]

    def get(self, request, *args, **kwargs):
        with public_schema():
            return Response(collect_dashboard_payload())


class SuperadminGlobalRegistryView(APIView):
    """Global vehicle registry summary for platform operators."""

    permission_classes = [IsSuperAdmin]

    def get(self, request, *args, **kwargs):
        with public_schema():
            return Response(collect_global_registry_payload())
