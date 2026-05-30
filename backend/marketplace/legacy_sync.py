"""
Mirror legacy MarketplaceListing rows into the SparePart catalog.

Listings created via the old /api/v1/marketplace/ endpoint after the
initial data migration still need to appear in the new catalog UI.
"""
from __future__ import annotations

from decimal import Decimal

from .models import MarketplaceListing, MarketplaceSeller, PartCategory, SparePart

_LEGACY_CATEGORY_SLUG = {
    "parts": "other",
    "tools": "tools",
    "equipment": "equipment",
    "other": "other",
}


def _default_category() -> PartCategory | None:
    return PartCategory.objects.filter(slug="other").first()


def _get_or_create_seller_for_legacy(listing: MarketplaceListing) -> MarketplaceSeller | None:
    if listing.tenant_id is None:
        return None
    seller, created = MarketplaceSeller.objects.get_or_create(
        tenant=listing.tenant,
        defaults={
            "seller_type": MarketplaceSeller.SellerType.WORKSHOP,
            "business_name": listing.tenant.name,
            "contact_phone": listing.contact_phone or listing.tenant.contact_phone or "",
            "contact_whatsapp": listing.contact_whatsapp or "",
            "contact_email": listing.contact_email or listing.tenant.contact_email or "",
            "location_city": (listing.tenant.address or "").split(",")[0].strip(),
            "location_country": "XK",
            # Legacy listings were public immediately — keep that behaviour.
            "is_approved": True,
        },
    )
    if not created and listing.is_active and not listing.is_sold and not seller.is_approved:
        seller.is_approved = True
        seller.save(update_fields=["is_approved"])
    return seller


def _find_mirrored_part(seller: MarketplaceSeller, listing: MarketplaceListing) -> SparePart | None:
    return (
        SparePart.objects.filter(
            seller=seller,
            title=listing.title,
            price=listing.price,
        )
        .order_by("created_at")
        .first()
    )


def mirror_legacy_listing(listing: MarketplaceListing) -> SparePart | None:
    """Create or update the catalog SparePart for a legacy listing."""
    seller = _get_or_create_seller_for_legacy(listing)
    if seller is None:
        return None

    category_slug = _LEGACY_CATEGORY_SLUG.get(listing.category, "other")
    category = PartCategory.objects.filter(slug=category_slug).first() or _default_category()
    if category is None:
        return None

    is_active = bool(listing.is_active and not listing.is_sold)
    part = _find_mirrored_part(seller, listing)

    if part is None:
        if not is_active:
            return None
        return SparePart.objects.create(
            seller=seller,
            category=category,
            title=listing.title,
            description=listing.description or "",
            listing_type=SparePart.ListingType.GENERIC,
            condition=SparePart.Condition.USED,
            quantity=max(listing.quantity_available or 1, 1),
            price=listing.price or Decimal("0"),
            currency=(listing.currency or "EUR").upper(),
            is_active=True,
        )

    part.title = listing.title
    part.description = listing.description or ""
    part.category = category
    part.quantity = max(listing.quantity_available or 1, 1)
    part.price = listing.price or Decimal("0")
    part.currency = (listing.currency or "EUR").upper()
    part.is_active = is_active
    part.save(
        update_fields=[
            "title",
            "description",
            "category",
            "quantity",
            "price",
            "currency",
            "is_active",
            "updated_at",
        ],
    )
    return part


def sync_unmirrored_legacy_listings() -> int:
    """Backfill any legacy listings missing from the catalog. Returns count synced."""
    synced = 0
    for listing in MarketplaceListing.objects.select_related("tenant").iterator():
        seller = MarketplaceSeller.objects.filter(tenant_id=listing.tenant_id).first()
        if seller and _find_mirrored_part(seller, listing):
            continue
        if mirror_legacy_listing(listing):
            synced += 1
    return synced
