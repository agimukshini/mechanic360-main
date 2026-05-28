"""
Custom user model and roles for Mechanic360.

Workshop staff roles:
- Admin (shop owner / manager)
- Mechanic / Technician

Vehicle owners use the separate `owner` role.

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
        MECHANIC = "mechanic", "Mechanic / Technician"
        OWNER = "owner", "Vehicle Owner"

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

    phone = models.CharField(max_length=32, blank=True, default="")

    class Theme(models.TextChoices):
        LIGHT = "light", "Light"
        DARK = "dark", "Dark"
        SYSTEM = "system", "System"

    theme = models.CharField(
        max_length=16,
        choices=Theme.choices,
        default=Theme.LIGHT,
    )
    email_notifications = models.BooleanField(default=True)
    sms_notifications = models.BooleanField(default=False)
    whatsapp_notifications = models.BooleanField(default=False)

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


from .login_audit_models import LoginAuditEvent  # noqa: E402, F401
from .invite_models import StaffInviteToken  # noqa: E402, F401


