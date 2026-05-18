"""
Custom user model and roles for Mechanic360.

Roles match the working scope:
- Admin
- Service Advisor
- Mechanic / Technician

Primary keys use UUIDs instead of auto-incrementing integers to ensure global
uniqueness and avoid exposing sequence counts.
"""
from __future__ import annotations

import uuid

from django.contrib.auth.models import AbstractUser
from django.db import models


class User(AbstractUser):
    """
    Extends Django's built-in user with workshop-specific roles.

    We keep the model intentionally lean and drive most authorization through
    Django permissions and DRF permission classes.
    """

    # Use UUID instead of integer IDs
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)

    class Role(models.TextChoices):
        ADMIN = "admin", "Admin"
        SERVICE_ADVISOR = "service_advisor", "Service Advisor"
        MECHANIC = "mechanic", "Mechanic / Technician"

    role = models.CharField(
        max_length=32,
        choices=Role.choices,
        default=Role.MECHANIC,
        help_text="Determines the user's primary responsibility in the workshop.",
    )

    # Optional link to the workshop tenant the user primarily belongs to.
    # This is a soft association; tenant routing still happens via domain +
    # django-tenants middleware.
    tenant = models.ForeignKey(
        "tenancy.WorkshopTenant",
        related_name="users",
        on_delete=models.PROTECT,
        null=True,
        blank=True,
        help_text="Primary workshop this user belongs to.",
    )

    quick_pin = models.CharField(
        max_length=128,
        blank=True,
        default="",
        help_text="Hashed numeric PIN for quick sign-in at the workshop.",
    )

    def is_admin(self) -> bool:
        """Convenience helper for checking if the user is a tenant admin."""
        return self.role == self.Role.ADMIN

    @property
    def has_quick_pin(self) -> bool:
        return bool(self.quick_pin)

    def set_quick_pin(self, raw_pin: str) -> None:
        from django.contrib.auth.hashers import make_password

        self.quick_pin = make_password(raw_pin)

    def check_quick_pin(self, raw_pin: str) -> bool:
        from django.contrib.auth.hashers import check_password

        return bool(self.quick_pin) and check_password(raw_pin, self.quick_pin)


