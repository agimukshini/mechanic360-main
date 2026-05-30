"""
Marketplace catalog helpers.
"""
from __future__ import annotations

from django.utils import timezone

from accounts.models import User
from tenancy.models import WorkshopTenant

from .models import MarketplaceSeller


def get_workshop_seller(tenant: WorkshopTenant) -> MarketplaceSeller | None:
    return MarketplaceSeller.objects.filter(tenant=tenant).first()


def get_or_create_workshop_seller(
    tenant: WorkshopTenant,
    *,
    created_by: User | None = None,
) -> tuple[MarketplaceSeller, bool]:
    """
    Ensure a workshop seller profile exists for the tenant.

    New sellers start unapproved — superadmin must approve before parts
    appear in mechanic-facing search (grandfathered rows from migration
    were seeded with is_approved=True).
    """
    seller, created = MarketplaceSeller.objects.get_or_create(
        tenant=tenant,
        defaults={
            "seller_type": MarketplaceSeller.SellerType.WORKSHOP,
            "business_name": tenant.name,
            "location_city": _tenant_city(tenant),
            "location_country": "XK",
            "contact_phone": tenant.contact_phone or "",
            "contact_email": tenant.contact_email or "",
            "is_approved": False,
        },
    )
    if created and created_by and created_by.is_superuser:
        seller.is_approved = True
        seller.approved_at = timezone.now()
        seller.approved_by = created_by
        seller.save(update_fields=["is_approved", "approved_at", "approved_by"])
    return seller, created


def _tenant_city(tenant: WorkshopTenant) -> str:
    address = (tenant.address or "").strip()
    if not address:
        return ""
    # Use the first comma-separated segment as a rough city hint.
    return address.split(",")[0].strip()
