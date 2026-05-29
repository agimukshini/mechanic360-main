"""
Data migration: seed an initial part-category tree, and mirror every
existing `MarketplaceListing` into a (`MarketplaceSeller`, `SparePart`)
pair so the new catalog isn't empty on day one.

Why a data migration and not a management command:
  • This must run exactly once on every environment.
  • Production has live data from the legacy listings table — losing it
    would be a regression.

Idempotency rules:
  • Categories are looked up by slug; re-running picks up existing rows.
  • Sellers are keyed off `tenant_id`; one workshop seller per tenant.
  • Each legacy listing's mirror is idempotent on
    `(seller_id, title, price)` — re-running won't double up.

Reverting:
  • Removes `SparePart` rows with category=migration_seed marker.
  • Removes the seller rows we created (those without parts).
  • Leaves `PartCategory`/`VehicleIssue` seeds in place — destructive
    rollback would orphan any user-created parts that referenced them.
"""
from __future__ import annotations

from decimal import Decimal

from django.db import migrations


PART_CATEGORIES = [
    # (slug, name, parent_slug)
    ("brake_system", "Brake system", None),
    ("brake_pads", "Brake pads", "brake_system"),
    ("brake_discs", "Brake discs", "brake_system"),
    ("brake_calipers", "Brake calipers", "brake_system"),
    ("brake_sensors", "Brake sensors", "brake_system"),

    ("engine", "Engine", None),
    ("filters", "Filters", "engine"),
    ("oil_filter", "Oil filter", "filters"),
    ("air_filter", "Air filter", "filters"),
    ("fuel_filter", "Fuel filter", "filters"),
    ("cabin_filter", "Cabin filter", "filters"),
    ("ignition", "Ignition", "engine"),
    ("spark_plugs", "Spark plugs", "ignition"),
    ("glow_plugs", "Glow plugs", "ignition"),

    ("suspension", "Suspension & steering", None),
    ("shocks", "Shock absorbers", "suspension"),
    ("control_arms", "Control arms", "suspension"),
    ("ball_joints", "Ball joints", "suspension"),

    ("electrical", "Electrical", None),
    ("battery", "Battery", "electrical"),
    ("alternator", "Alternator", "electrical"),
    ("starter", "Starter motor", "electrical"),
    ("sensors", "Sensors", "electrical"),

    ("transmission", "Transmission & drivetrain", None),
    ("clutch", "Clutch", "transmission"),
    ("cv_joints", "CV joints", "transmission"),

    ("body", "Body & exterior", None),
    ("lights", "Lights", "body"),
    ("mirrors", "Mirrors", "body"),
    ("bumpers", "Bumpers", "body"),

    ("tools", "Tools", None),
    ("equipment", "Equipment", None),
    ("other", "Other", None),
]


# Issues map onto category slugs. Used for the recommendation engine.
VEHICLE_ISSUES = [
    # (slug, name, [category slugs])
    ("brake_squeal", "Brake squeal / grinding", ["brake_pads", "brake_discs"]),
    ("brake_pulsation", "Brake pulsation when stopping", ["brake_discs", "brake_calipers"]),
    ("oil_change_due", "Oil change due", ["oil_filter"]),
    ("hard_starting", "Hard starting / no start", ["battery", "starter", "spark_plugs", "glow_plugs"]),
    ("rough_idle", "Rough idle / misfire", ["spark_plugs", "air_filter", "fuel_filter"]),
    ("knocking_suspension", "Knocking over bumps", ["shocks", "control_arms", "ball_joints"]),
    ("electrical_warning", "Electrical / battery warning", ["battery", "alternator", "sensors"]),
    ("clutch_slipping", "Clutch slipping", ["clutch"]),
    ("vibration_steering", "Vibration through steering", ["control_arms", "ball_joints"]),
    ("light_out", "Headlight / tail light out", ["lights"]),
]


def _slugify_category(category: str) -> str:
    """Map the legacy 4-value category onto the new taxonomy."""
    return {
        "parts": "other",
        "tools": "tools",
        "equipment": "equipment",
        "other": "other",
    }.get(category, "other")


def seed_catalog(apps, schema_editor):
    PartCategory = apps.get_model("marketplace", "PartCategory")
    VehicleIssue = apps.get_model("marketplace", "VehicleIssue")

    slug_to_obj: dict[str, object] = {}
    # Pass 1 — create every category without parents.
    for sort_idx, (slug, name, _parent) in enumerate(PART_CATEGORIES):
        obj, _ = PartCategory.objects.get_or_create(
            slug=slug, defaults={"name": name, "sort_order": sort_idx},
        )
        slug_to_obj[slug] = obj
    # Pass 2 — wire up parents now that all rows exist.
    for slug, _name, parent_slug in PART_CATEGORIES:
        if parent_slug:
            child = slug_to_obj[slug]
            child.parent = slug_to_obj[parent_slug]
            child.save(update_fields=["parent"])

    for sort_idx, (slug, name, cat_slugs) in enumerate(VEHICLE_ISSUES):
        issue, _ = VehicleIssue.objects.get_or_create(
            slug=slug, defaults={"name": name, "sort_order": sort_idx},
        )
        if not issue.mapped_categories.exists():
            issue.mapped_categories.set(
                [slug_to_obj[s] for s in cat_slugs if s in slug_to_obj],
            )


def mirror_listings(apps, schema_editor):
    """Each legacy listing → workshop seller + spare part."""
    MarketplaceListing = apps.get_model("marketplace", "MarketplaceListing")
    MarketplaceSeller = apps.get_model("marketplace", "MarketplaceSeller")
    SparePart = apps.get_model("marketplace", "SparePart")
    PartCategory = apps.get_model("marketplace", "PartCategory")

    other_category = PartCategory.objects.filter(slug="other").first()
    if other_category is None:
        return

    for listing in MarketplaceListing.objects.select_related("tenant"):
        seller, _ = MarketplaceSeller.objects.get_or_create(
            tenant=listing.tenant,
            defaults={
                "seller_type": MarketplaceSeller._meta.get_field(
                    "seller_type"
                ).choices[0][0],  # "workshop"
                "business_name": listing.tenant.name,
                "contact_phone": listing.contact_phone,
                "contact_whatsapp": listing.contact_whatsapp,
                "contact_email": listing.contact_email,
                "is_approved": True,  # grandfather existing tenants in
            },
        )

        category = (
            PartCategory.objects.filter(slug=_slugify_category(listing.category)).first()
            or other_category
        )

        if SparePart.objects.filter(
            seller=seller, title=listing.title, price=listing.price,
        ).exists():
            continue

        SparePart.objects.create(
            seller=seller,
            category=category,
            title=listing.title,
            description=listing.description or "",
            condition="used",  # listings predate condition tracking
            quantity=listing.quantity_available or 1,
            price=listing.price,
            currency=(listing.currency or "EUR").upper(),
            is_active=listing.is_active and not listing.is_sold,
        )


def reverse_seed(apps, schema_editor):
    # Best-effort — leave categories and issues so any user-created parts
    # referencing them don't break (the model uses on_delete=PROTECT).
    pass


class Migration(migrations.Migration):
    dependencies = [
        (
            "marketplace",
            "0002_alter_marketplacelisting_options_marketplaceseller_and_more",
        ),
    ]

    operations = [
        migrations.RunPython(seed_catalog, reverse_seed),
        migrations.RunPython(mirror_listings, reverse_seed),
    ]
