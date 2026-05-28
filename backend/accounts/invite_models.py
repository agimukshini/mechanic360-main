"""One-time staff invite tokens for workshop team onboarding."""
from __future__ import annotations

import uuid
from datetime import timedelta

from django.conf import settings
from django.db import models
from django.utils import timezone


class StaffInviteToken(models.Model):
    """
    Single-use invite link for a mechanic or service advisor to join a workshop.

    Expires 24 hours after creation. Accepted once via /invite/staff/{id}.
    """

    DEFAULT_TTL = timedelta(hours=24)

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    tenant = models.ForeignKey(
        "tenancy.WorkshopTenant",
        related_name="staff_invites",
        on_delete=models.CASCADE,
    )
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        related_name="created_staff_invites",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
    )

    email = models.EmailField(blank=True, default="")
    first_name = models.CharField(max_length=150, blank=True, default="")
    last_name = models.CharField(max_length=150, blank=True, default="")
    role = models.CharField(max_length=32, default="mechanic")

    expires_at = models.DateTimeField()
    used_at = models.DateTimeField(null=True, blank=True)
    accepted_user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        related_name="accepted_staff_invite",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
    )

    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-created_at"]

    def __str__(self) -> str:
        return f"Staff invite {self.id} ({self.tenant.name})"

    @classmethod
    def default_expiry(cls):
        return timezone.now() + cls.DEFAULT_TTL

    @property
    def is_valid(self) -> bool:
        return self.used_at is None and self.expires_at > timezone.now()
