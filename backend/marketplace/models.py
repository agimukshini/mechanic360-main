"""
Marketplace models for cross-tenant parts sharing.

This app lives in the PUBLIC schema so that listings from all tenants
can be viewed across the marketplace.
"""
from __future__ import annotations

import uuid

from django.db import models
from django.conf import settings


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

    def __str__(self) -> str:
        return f"{self.title} ({self.tenant.name})"
