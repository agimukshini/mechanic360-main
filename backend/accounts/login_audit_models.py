"""
Login audit trail for authentication events.

See working_scope/USER_PROFILE_MECHANICS_AND_AUDIT.md Phase B.
"""
from __future__ import annotations

import uuid

from django.conf import settings
from django.db import models


class LoginAuditEvent(models.Model):
    """Records successful and failed sign-in attempts (public schema)."""

    class Outcome(models.TextChoices):
        SUCCESS = "success", "Success"
        FAILED_PASSWORD = "failed_password", "Failed password"
        FAILED_PIN = "failed_pin", "Failed PIN"
        FAILED_UNKNOWN_USER = "failed_unknown_user", "Unknown user"
        FAILED_INACTIVE = "failed_inactive", "Inactive user"
        FAILED_TENANT_INACTIVE = "failed_tenant_inactive", "Inactive workshop"

    class AuthMethod(models.TextChoices):
        PASSWORD = "password", "Password"
        PIN = "pin", "PIN"
        REFRESH = "refresh", "Token refresh"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    username_attempted = models.CharField(max_length=150, db_index=True)
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        related_name="login_audit_events",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
    )
    tenant = models.ForeignKey(
        "tenancy.WorkshopTenant",
        related_name="login_audit_events",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
    )
    outcome = models.CharField(max_length=32, choices=Outcome.choices, db_index=True)
    auth_method = models.CharField(max_length=16, choices=AuthMethod.choices, db_index=True)
    ip_address = models.GenericIPAddressField(null=True, blank=True)
    user_agent = models.CharField(max_length=512, blank=True, default="")
    created_at = models.DateTimeField(auto_now_add=True, db_index=True)

    class Meta:
        ordering = ["-created_at"]
        verbose_name = "Login audit event"
        verbose_name_plural = "Login audit events"

    def __str__(self) -> str:
        return f"{self.username_attempted} — {self.outcome} ({self.auth_method})"
