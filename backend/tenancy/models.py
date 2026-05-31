"""
Multi-tenant workshop models.

We use django-tenants' `TenantModel` to create one PostgreSQL schema per
workshop. This aligns with the working scope requirement:
- schema-based multi-tenancy
- potential for PostgreSQL Row-Level Security (RLS) if needed later

All primary keys are UUIDs instead of incrementing integers.
"""
from __future__ import annotations

import uuid

from django.db import models
from django_tenants.models import TenantMixin, DomainMixin
from django.utils.text import slugify


class WorkshopTenant(TenantMixin, models.Model):
    """
    Represents a single workshop (tenant) in the system.

    Each instance will get its own PostgreSQL schema. All per-workshop data
    (clients, vehicles, visits, inspections, inventory, etc.) lives there.
    """

    # Use UUID instead of integer IDs for better global uniqueness
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)

    # schema_name is provided by TenantMixin
    # auto_create_schema is provided by TenantMixin (defaults to True)

    name = models.CharField(max_length=255)
    business_registration_number = models.CharField(
        max_length=9,
        blank=True,
        db_index=True,
        help_text="ARBK Numri Unik Identifikues (NUI).",
    )
    logo_url = models.URLField(blank=True)
    address = models.TextField(blank=True)
    contact_email = models.EmailField(blank=True)
    contact_phone = models.CharField(max_length=64, blank=True)

    # Legacy label — use ``TenantPlatformBilling`` for real pricing. ``trial`` only when set explicitly.
    subscription_plan = models.CharField(max_length=64, default="none")
    is_active = models.BooleanField(default=True)

    # Workshop preferences
    currency = models.CharField(max_length=3, default='EUR', help_text="ISO 4217 currency code")
    language = models.CharField(max_length=10, default='sq', help_text="ISO 639-1 language code")

    # Timestamps
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name = "Workshop Tenant"
        verbose_name_plural = "Workshop Tenants"

    def __str__(self) -> str:
        return self.name


class WorkshopDomain(DomainMixin):
    """
    Maps domains or subdomains to `WorkshopTenant` schemas.

    Examples:
      - `alpha.mech360.localhost` -> Alpha Garage schema
      - `beta.mech360.localhost`  -> Beta Workshop schema
    """

    # Override the default integer PK with a UUID-based primary key
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)

    # DomainMixin already provides:
    #   - domain   (str)
    #   - tenant   (FK to WorkshopTenant)
    #   - is_primary (bool)

    def save(self, *args, **kwargs):
        """
        Normalize the domain before saving (lowercase, stripped).
        """
        if self.domain:
            self.domain = self.domain.strip().lower()
        super().save(*args, **kwargs)


class TenantOnboardingApplication(models.Model):
    """
    Workshop signup request awaiting platform superuser approval.

    Tenant schema and admin user are provisioned only after approval.
    """

    class Status(models.TextChoices):
        PENDING = "pending", "Pending review"
        APPROVED = "approved", "Approved"
        REJECTED = "rejected", "Rejected"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)

    workshop_name = models.CharField(max_length=255)
    business_registration_number = models.CharField(
        max_length=9,
        blank=True,
        db_index=True,
        help_text="ARBK Numri Unik Identifikues (NUI).",
    )
    address = models.TextField(blank=True)
    contact_email = models.EmailField(blank=True)
    contact_phone = models.CharField(max_length=64, blank=True)

    verification_code = models.CharField(max_length=8, blank=True, db_index=True)
    verification_code_confirmed_at = models.DateTimeField(null=True, blank=True)
    verification_code_confirmed_by = models.ForeignKey(
        "accounts.User",
        related_name="confirmed_onboarding_verification_codes",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
    )

    class VerificationChannel(models.TextChoices):
        EMAIL = "email", "Email"
        PHONE = "phone", "Phone"
        EMAIL_LINK = "email_link", "Email link (one-click)"

    verification_code_channel = models.CharField(
        max_length=16,
        choices=VerificationChannel.choices,
        blank=True,
    )
    verification_code_note = models.TextField(blank=True)

    admin_username = models.CharField(max_length=150)
    admin_email = models.EmailField()
    admin_password_hash = models.CharField(max_length=128)

    status = models.CharField(
        max_length=16,
        choices=Status.choices,
        default=Status.PENDING,
        db_index=True,
    )
    rejection_reason = models.TextField(blank=True)

    tenant = models.ForeignKey(
        WorkshopTenant,
        related_name="onboarding_applications",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
    )
    reviewed_by = models.ForeignKey(
        "accounts.User",
        related_name="reviewed_onboarding_applications",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
    )
    reviewed_at = models.DateTimeField(null=True, blank=True)

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name = "Tenant Onboarding Application"
        verbose_name_plural = "Tenant Onboarding Applications"
        ordering = ["-created_at"]

    def __str__(self) -> str:
        return f"{self.workshop_name} ({self.get_status_display()})"


class OnboardingVerificationToken(models.Model):
    """
    One-click email verification link for pending workshop onboarding applications.

    Single use; records click IP and user agent for audit.
    """

    DEFAULT_TTL_DAYS = 7

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    application = models.ForeignKey(
        TenantOnboardingApplication,
        related_name="verification_tokens",
        on_delete=models.CASCADE,
    )
    expires_at = models.DateTimeField()
    clicked_at = models.DateTimeField(null=True, blank=True)
    click_ip = models.CharField(max_length=64, blank=True, default="")
    click_user_agent = models.CharField(max_length=512, blank=True, default="")
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-created_at"]

    def __str__(self) -> str:
        return f"Onboarding verify {self.id} ({self.application.workshop_name})"

    @property
    def is_valid(self) -> bool:
        from django.utils import timezone

        return self.clicked_at is None and self.expires_at > timezone.now()


