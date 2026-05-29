"""
Client model for the Mechanic360 platform.

Moved from vehicles.models to clients.models to match the app structure
expected by settings.py and urls.py.
"""
from __future__ import annotations

import uuid

from django.db import models


class Client(models.Model):
    """
    Represents a workshop client (individual or company).
    """

    # UUID primary key
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)

    INDIVIDUAL = "individual"
    COMPANY = "company"
    CLIENT_TYPE_CHOICES = [
        (INDIVIDUAL, "Private Individual"),
        (COMPANY, "Company / Fleet"),
    ]

    type = models.CharField(max_length=16, choices=CLIENT_TYPE_CHOICES, default=INDIVIDUAL)
    name = models.CharField(max_length=255)
    company_name = models.CharField(max_length=255, blank=True)
    email = models.EmailField(blank=True)
    phone = models.CharField(max_length=64, blank=True)
    preferred_channel = models.CharField(
        max_length=32,
        blank=True,
        help_text="Preferred communication channel (SMS, WhatsApp, Email).",
    )

    # When this client mirrors a platform-wide GlobalOwner, store its UUID so
    # we never duplicate an identity across tenants. The Client row itself
    # stays even after the owner sells the vehicle — it's the workshop's CRM
    # memory of "this person walked into our shop on these dates".
    global_owner_id = models.UUIDField(
        null=True,
        blank=True,
        db_index=True,
        unique=True,
        help_text="Link to the platform-wide GlobalOwner (public schema).",
    )

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["name"]

    def __str__(self) -> str:
        return self.name or self.company_name
