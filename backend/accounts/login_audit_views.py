"""
Serializers and list views for login audit events.
"""
from __future__ import annotations

from datetime import timedelta

from django.contrib.auth import get_user_model
from django.utils import timezone
from rest_framework import generics, permissions, serializers

from mechanic360.permissions import IsPlatformSuperuser
from mechanic360.permissions import IsTenantAdmin

from .login_audit_models import LoginAuditEvent

User = get_user_model()

TENANT_ADMIN_DAYS = 30


class LoginAuditEventSerializer(serializers.ModelSerializer):
    user_display = serializers.SerializerMethodField()
    tenant_name = serializers.SerializerMethodField()

    class Meta:
        model = LoginAuditEvent
        fields = [
            "id",
            "username_attempted",
            "user_display",
            "tenant_name",
            "outcome",
            "auth_method",
            "ip_address",
            "user_agent",
            "created_at",
        ]
        read_only_fields = fields

    def get_user_display(self, obj: LoginAuditEvent) -> str | None:
        if obj.user_id:
            return obj.user.username
        return None

    def get_tenant_name(self, obj: LoginAuditEvent) -> str | None:
        if obj.tenant_id:
            return obj.tenant.name
        return None


def _parse_days_param(request, default: int) -> int:
    raw = request.query_params.get("days")
    if raw is None:
        return default
    try:
        days = int(raw)
    except (TypeError, ValueError):
        return default
    return max(1, min(days, 365))


class TenantLoginAuditListView(generics.ListAPIView):
    """Workshop admin: login events for their tenant (last 30 days by default)."""

    serializer_class = LoginAuditEventSerializer
    permission_classes = [permissions.IsAuthenticated, IsTenantAdmin]

    def get_queryset(self):
        tenant_id = self.request.user.tenant_id
        days = _parse_days_param(self.request, TENANT_ADMIN_DAYS)
        since = timezone.now() - timedelta(days=days)
        return (
            LoginAuditEvent.objects.filter(tenant_id=tenant_id, created_at__gte=since)
            .select_related("user", "tenant")
            .order_by("-created_at")
        )


class SuperadminLoginAuditListView(generics.ListAPIView):
    """Platform superuser: filterable login audit across all tenants."""

    serializer_class = LoginAuditEventSerializer
    permission_classes = [permissions.IsAuthenticated, IsPlatformSuperuser]

    def get_queryset(self):
        days = _parse_days_param(self.request, 30)
        since = timezone.now() - timedelta(days=days)
        qs = LoginAuditEvent.objects.filter(created_at__gte=since).select_related(
            "user",
            "tenant",
        )

        outcome = self.request.query_params.get("outcome")
        if outcome:
            qs = qs.filter(outcome=outcome)

        username = self.request.query_params.get("username")
        if username:
            qs = qs.filter(username_attempted__icontains=username.strip())

        tenant_id = self.request.query_params.get("tenant_id")
        if tenant_id:
            qs = qs.filter(tenant_id=tenant_id)

        return qs.order_by("-created_at")
