"""
In-app notification model.

Stores system-generated notifications for users within a tenant.
"""
from __future__ import annotations

import uuid

from django.conf import settings
from django.db import models


class Notification(models.Model):
    """
    System-generated notification for a user.
    """

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)

    class Type(models.TextChoices):
        INFO = "info", "Info"
        WARNING = "warning", "Warning"
        SUCCESS = "success", "Success"
        ERROR = "error", "Error"

    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        related_name="notifications",
        on_delete=models.CASCADE,
    )
    title = models.CharField(max_length=255)
    message = models.TextField()
    type = models.CharField(max_length=32, choices=Type.choices, default=Type.INFO)
    link = models.CharField(max_length=512, blank=True, help_text="Optional URL to navigate to")
    is_read = models.BooleanField(default=False)

    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-created_at"]

    def __str__(self) -> str:
        return f"[{self.type}] {self.title} for {self.user}"
