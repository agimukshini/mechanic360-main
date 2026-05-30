"""
Marketplace models for cross-tenant parts sharing.

This app lives in the PUBLIC schema so that listings from all tenants
can be viewed across the marketplace.

Phase A (catalog foundation, this commit):
  • MarketplaceSeller — superset of "the workshop that listed this":
    workshops on the platform, external parts shops, and individuals.
  • PartCategory — hierarchical taxonomy (brake_system → brake_pads, …).
  • SparePart — the actual listed item, multi-fit by design.
  • VehicleCompatibility — one row per (part, vehicle-range) pair so a
    single brake pad can fit a range of make/model/year/engine/trim
    without duplicating the part row.
  • VehicleIssue — mechanic-facing issue taxonomy mapped to PartCategory.
  • MarketplaceBannerEvent — banner impression / click / contact telemetry.

The legacy `MarketplaceListing` row stays for two releases so existing
listings keep rendering while we cut over the frontend. A data migration
in this slice mirrors each row into a (Seller + SparePart) pair.
"""
from __future__ import annotations

import uuid
from decimal import Decimal

from django.conf import settings
from django.contrib.postgres.indexes import GinIndex
from django.db import models


# ---------------------------------------------------------------------------
# Sellers
# ---------------------------------------------------------------------------


class MarketplaceSeller(models.Model):
    """
    Whoever is offering parts. Three flavours:

    - WORKSHOP — a tenant on the platform; `tenant` is set, no contact_user.
    - PARTS_SHOP — a third-party parts vendor with a User account but no
      WorkshopTenant.
    - INDIVUDAL — a private seller. Often offloads OEM take-offs.

    Approval gates the seller's catalog from mechanic-facing endpoints.
    Suspension flows through `is_approved=False` set by the superadmin.
    """

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)

    class SellerType(models.TextChoices):
        WORKSHOP = "workshop", "Workshop"
        PARTS_SHOP = "parts_shop", "Parts shop"
        INDIVIDUAL = "individual", "Individual"

    seller_type = models.CharField(max_length=20, choices=SellerType.choices)
    business_name = models.CharField(max_length=255)
    tenant = models.ForeignKey(
        "tenancy.WorkshopTenant",
        related_name="marketplace_seller_profiles",
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        help_text="Set when seller is a workshop on the platform.",
    )
    contact_user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="marketplace_seller_accounts",
    )

    # Plain location fields — full geo (PointField + GIST index) is a future
    # phase. Keep cities + countries searchable for now.
    location_city = models.CharField(max_length=128, blank=True)
    location_country = models.CharField(max_length=64, default="XK")
    location_latitude = models.DecimalField(
        max_digits=9, decimal_places=6, null=True, blank=True,
    )
    location_longitude = models.DecimalField(
        max_digits=9, decimal_places=6, null=True, blank=True,
    )

    # Membership / billing — same vocabulary as TenantPlatformBilling so
    # we can later unify into a single invoice abstraction.
    membership_plan = models.CharField(max_length=32, default="free")
    billing_status = models.CharField(max_length=16, default="active")

    # Approval workflow.
    is_approved = models.BooleanField(default=False)
    approved_at = models.DateTimeField(null=True, blank=True)
    approved_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="approved_marketplace_sellers",
    )
    suspension_reason = models.CharField(max_length=255, blank=True)

    # Commercial contact channels — separate from the contact_user account.
    contact_phone = models.CharField(max_length=32, blank=True)
    contact_whatsapp = models.CharField(max_length=32, blank=True)
    contact_email = models.EmailField(blank=True)

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name = "Marketplace seller"
        verbose_name_plural = "Marketplace sellers"
        indexes = [
            models.Index(fields=["seller_type", "is_approved"]),
            models.Index(fields=["tenant"]),
            models.Index(fields=["location_country", "location_city"]),
        ]
        constraints = [
            models.UniqueConstraint(
                fields=["tenant"],
                condition=models.Q(tenant__isnull=False),
                name="unique_workshop_seller_per_tenant",
            ),
        ]

    def __str__(self) -> str:
        return f"{self.business_name} ({self.get_seller_type_display()})"


# ---------------------------------------------------------------------------
# Catalog
# ---------------------------------------------------------------------------


class PartCategory(models.Model):
    """Hierarchical category — brake_system → brake_pads, brake_discs, …"""

    id = models.AutoField(primary_key=True)
    slug = models.SlugField(unique=True, max_length=80)
    name = models.CharField(max_length=128)
    parent = models.ForeignKey(
        "self",
        null=True,
        blank=True,
        related_name="children",
        on_delete=models.CASCADE,
    )
    description = models.TextField(blank=True)
    sort_order = models.PositiveIntegerField(default=0)

    class Meta:
        verbose_name = "Part category"
        verbose_name_plural = "Part categories"
        ordering = ["sort_order", "name"]
        indexes = [
            models.Index(fields=["parent"]),
        ]

    def __str__(self) -> str:
        return self.name


class SparePart(models.Model):
    """
    A listable spare part. The `seller` owns it; multi-fit compatibility is
    in `VehicleCompatibility`. Soft-delete via `is_active=False` and
    `suspended_at` (set by superadmin) — never hard-delete history.
    """

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    seller = models.ForeignKey(
        MarketplaceSeller,
        related_name="parts",
        on_delete=models.CASCADE,
    )

    part_number = models.CharField(max_length=64, db_index=True, blank=True)
    oem_number = models.CharField(max_length=64, blank=True, db_index=True)
    # Aftermarket / supplier brand (Bosch, Mann, OEM take-off source, etc.)
    brand = models.CharField(max_length=128, blank=True)
    # Cross-references / aliases — supports OEM ↔ aftermarket lookups.
    alternative_numbers = models.JSONField(default=list, blank=True)

    class ListingType(models.TextChoices):
        IDENTIFIED = "identified", "Catalog-identified (OEM / part number)"
        GENERIC = "generic", "General listing (no part numbers)"

    listing_type = models.CharField(
        max_length=16,
        choices=ListingType.choices,
        default=ListingType.GENERIC,
        help_text="Identified listings require OEM or supplier part number.",
    )

    category = models.ForeignKey(PartCategory, on_delete=models.PROTECT)
    title = models.CharField(max_length=255)
    description = models.TextField(blank=True)

    class Condition(models.TextChoices):
        NEW = "new", "New"
        USED = "used", "Used"
        REFURBISHED = "refurbished", "Refurbished"
        OEM_TAKEOFF = "oem_takeoff", "OEM take-off"

    condition = models.CharField(
        max_length=16, choices=Condition.choices, default=Condition.NEW,
    )
    quantity = models.PositiveIntegerField(default=1)
    price = models.DecimalField(max_digits=10, decimal_places=2)
    currency = models.CharField(max_length=3, default="EUR")

    # Lifecycle
    is_active = models.BooleanField(default=True)
    suspended_at = models.DateTimeField(null=True, blank=True)
    suspended_reason = models.CharField(max_length=255, blank=True)

    # Promotion
    is_promoted = models.BooleanField(default=False)
    promoted_until = models.DateTimeField(null=True, blank=True)

    # Photos: list of /media/marketplace_parts/<filename>.jpg paths. We
    # store the relative path so swap-out of MEDIA_URL works without
    # rewriting rows.
    photos = models.JSONField(default=list, blank=True)

    # Override seller's location for parts that ship from a different city.
    location_city_override = models.CharField(max_length=128, blank=True)

    # Telemetry counters. Banner events (in MarketplaceBannerEvent) are the
    # source of truth — these are denormalised aggregates updated nightly.
    impressions = models.PositiveIntegerField(default=0)
    contact_requests = models.PositiveIntegerField(default=0)

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name = "Spare part"
        verbose_name_plural = "Spare parts"
        ordering = ["-is_promoted", "-created_at"]
        indexes = [
            models.Index(fields=["category", "is_active"]),
            models.Index(fields=["seller", "is_active"]),
            models.Index(fields=["part_number"]),
            models.Index(fields=["oem_number"]),
            GinIndex(fields=["alternative_numbers"]),
        ]

    def __str__(self) -> str:
        return f"{self.title} [{self.part_number or self.oem_number or '?'}]"


class VehicleCompatibility(models.Model):
    """
    One row per (part, vehicle-range) pair. Multi-fit by design.

    Why the year-range columns: TecDoc / CarAPI return data like
    "Audi A4 B8, 2008-2015". We store start + end so a single row covers
    the full applicability range; queries are `year_from <= y <= year_to`.
    """

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    spare_part = models.ForeignKey(
        SparePart,
        related_name="compatibilities",
        on_delete=models.CASCADE,
    )

    make = models.CharField(max_length=64, db_index=True)
    model = models.CharField(max_length=64, db_index=True)
    year_from = models.PositiveIntegerField()
    year_to = models.PositiveIntegerField()
    engine = models.CharField(max_length=64, blank=True)
    trim = models.CharField(max_length=64, blank=True)

    class Source(models.TextChoices):
        TECDOC = "tecdoc", "TecDoc"
        CARAPI = "carapi", "CarAPI"
        MANUAL = "manual", "Manual"
        SELLER = "seller", "Seller-entered"
        INFERRED = "inferred", "Inferred"

    compatibility_source = models.CharField(
        max_length=16, choices=Source.choices, default=Source.SELLER,
    )
    confidence_score = models.FloatField(default=1.0)

    notes = models.TextField(blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name = "Vehicle compatibility"
        verbose_name_plural = "Vehicle compatibilities"
        unique_together = [
            ("spare_part", "make", "model", "year_from", "year_to", "engine", "trim"),
        ]
        indexes = [
            models.Index(fields=["make", "model", "year_from", "year_to"]),
        ]

    def __str__(self) -> str:
        return f"{self.make} {self.model} {self.year_from}-{self.year_to}"


# ---------------------------------------------------------------------------
# Issue taxonomy + telemetry
# ---------------------------------------------------------------------------


class VehicleIssue(models.Model):
    """Issue → part-category mapping. Edited by superadmin."""

    id = models.AutoField(primary_key=True)
    slug = models.SlugField(unique=True, max_length=80)
    name = models.CharField(max_length=128)
    description = models.TextField(blank=True)
    sort_order = models.PositiveIntegerField(default=0)
    mapped_categories = models.ManyToManyField(
        PartCategory,
        related_name="issues",
        blank=True,
    )

    class Meta:
        verbose_name = "Vehicle issue"
        verbose_name_plural = "Vehicle issues"
        ordering = ["sort_order", "name"]

    def __str__(self) -> str:
        return self.name


class MarketplaceBannerEvent(models.Model):
    """One row per banner impression / click / contact request."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)

    mechanic_tenant_schema = models.CharField(max_length=63, db_index=True)
    mechanic_user_id = models.UUIDField(db_index=True, null=True, blank=True)
    vehicle_tenant_id = models.UUIDField(null=True, blank=True)
    global_vehicle_id = models.UUIDField(null=True, blank=True, db_index=True)
    issue = models.ForeignKey(
        VehicleIssue,
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
    )

    displayed_part_ids = models.JSONField(default=list, blank=True)
    clicked_part_id = models.UUIDField(null=True, blank=True, db_index=True)
    contact_clicked = models.BooleanField(default=False)

    occurred_at = models.DateTimeField(auto_now_add=True, db_index=True)

    class Meta:
        verbose_name = "Marketplace banner event"
        verbose_name_plural = "Marketplace banner events"
        ordering = ["-occurred_at"]
        indexes = [
            models.Index(fields=["mechanic_tenant_schema", "-occurred_at"]),
            models.Index(fields=["clicked_part_id"]),
            models.Index(fields=["issue", "-occurred_at"]),
        ]


# ---------------------------------------------------------------------------
# Legacy (kept for two releases — delete after frontend cuts over)
# ---------------------------------------------------------------------------


class MarketplaceListing(models.Model):
    """
    A listing for parts or tools that a workshop wants to share/sell
    to other workshops via the marketplace.
    """

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)

    # Tenant reference (workshop that owns this listing)
    tenant = models.ForeignKey(
        'tenancy.WorkshopTenant',
        related_name='marketplace_listings',
        on_delete=models.CASCADE,
    )

    # Listing details
    title = models.CharField(max_length=255)
    description = models.TextField(blank=True)
    category = models.CharField(
        max_length=100,
        choices=[
            ('parts', 'Parts'),
            ('tools', 'Tools'),
            ('equipment', 'Equipment'),
            ('other', 'Other'),
        ],
        default='parts',
    )

    # Pricing and availability
    price = models.DecimalField(max_digits=10, decimal_places=2)
    quantity_available = models.PositiveIntegerField(default=1)
    currency = models.CharField(max_length=3, default='USD')

    # Contact information (shown to buyers)
    contact_phone = models.CharField(max_length=32, blank=True)
    contact_whatsapp = models.CharField(max_length=32, blank=True)
    contact_email = models.EmailField(blank=True)

    # Status
    is_active = models.BooleanField(default=True)
    is_sold = models.BooleanField(default=False)

    # Timestamps
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['-created_at']
        verbose_name = "Marketplace listing (legacy)"

    def __str__(self) -> str:
        return f"{self.title} ({self.tenant.name})"
