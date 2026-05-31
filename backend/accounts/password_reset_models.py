"""Password reset one-time tokens with request/reset audit metadata."""
from __future__ import annotations

import uuid
from datetime import timedelta

from django.conf import settings
from django.db import models
from django.utils import timezone


class PasswordResetToken(models.Model):
    """Single-use password reset link (default 1 hour)."""

    DEFAULT_TTL = timedelta(hours=1)

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        related_name="password_reset_tokens",
        on_delete=models.CASCADE,
    )
    expires_at = models.DateTimeField()
    used_at = models.DateTimeField(null=True, blank=True)
    requested_at = models.DateTimeField(auto_now_add=True)
    request_ip = models.CharField(max_length=64, blank=True, default="")
    reset_ip = models.CharField(max_length=64, blank=True, default="")
    reset_user_agent = models.CharField(max_length=512, blank=True, default="")

    class Meta:
        ordering = ["-requested_at"]

    def __str__(self) -> str:
        return f"Password reset {self.id} ({self.user.username})"

    @classmethod
    def default_expiry(cls):
        return timezone.now() + cls.DEFAULT_TTL

    @property
    def is_valid(self) -> bool:
        return self.used_at is None and self.expires_at > timezone.now()
