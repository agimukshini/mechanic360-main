"""Backfill SparePart rows for legacy listings created after migration 0003."""

from __future__ import annotations

from decimal import Decimal

from django.db import migrations

_LEGACY_CATEGORY_SLUG = {
    "parts": "other",
    "tools": "tools",
    "equipment": "equipment",
    "other": "other",
}


def sync_legacy(apps, schema_editor):
    MarketplaceListing = apps.get_model("marketplace", "MarketplaceListing")
    MarketplaceSeller = apps.get_model("marketplace", "MarketplaceSeller")
    SparePart = apps.get_model("marketplace", "SparePart")
    PartCategory = apps.get_model("marketplace", "PartCategory")

    other_category = PartCategory.objects.filter(slug="other").first()
    if other_category is None:
        return

    for listing in MarketplaceListing.objects.select_related("tenant").iterator():
        seller, _ = MarketplaceSeller.objects.get_or_create(
            tenant=listing.tenant,
            defaults={
                "seller_type": "workshop",
                "business_name": listing.tenant.name,
                "contact_phone": listing.contact_phone or "",
                "contact_whatsapp": listing.contact_whatsapp or "",
                "contact_email": listing.contact_email or "",
                "is_approved": True,
            },
        )

        category = (
            PartCategory.objects.filter(
                slug=_LEGACY_CATEGORY_SLUG.get(listing.category, "other"),
            ).first()
            or other_category
        )

        if SparePart.objects.filter(
            seller=seller, title=listing.title, price=listing.price,
        ).exists():
            continue

        if not listing.is_active or listing.is_sold:
            continue

        SparePart.objects.create(
            seller=seller,
            category=category,
            title=listing.title,
            description=listing.description or "",
            listing_type="generic",
            condition="used",
            quantity=max(listing.quantity_available or 1, 1),
            price=listing.price or Decimal("0"),
            currency=(listing.currency or "EUR").upper(),
            is_active=True,
        )


class Migration(migrations.Migration):

    dependencies = [
        ("marketplace", "0004_sparepart_brand_listing_type"),
    ]

    operations = [
        migrations.RunPython(sync_legacy, migrations.RunPython.noop),
    ]
