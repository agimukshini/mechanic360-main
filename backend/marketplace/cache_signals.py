"""Invalidate marketplace Redis cache when catalog data changes."""
from __future__ import annotations

from django.db.models.signals import m2m_changed, post_delete, post_save
from django.dispatch import receiver

from .cache import invalidate_marketplace_cache
from .models import (
    MarketplaceSeller,
    PartCategory,
    SparePart,
    VehicleCompatibility,
    VehicleIssue,
)


def _invalidate(**kwargs):
    invalidate_marketplace_cache()


for model in (SparePart, MarketplaceSeller, PartCategory, VehicleIssue, VehicleCompatibility):
    post_save.connect(_invalidate, sender=model, dispatch_uid=f"mp-cache-save-{model.__name__}")
    post_delete.connect(_invalidate, sender=model, dispatch_uid=f"mp-cache-del-{model.__name__}")


@receiver(m2m_changed, sender=VehicleIssue.mapped_categories.through)
def invalidate_on_issue_category_map_change(**kwargs):
    if kwargs.get("action") in {"post_add", "post_remove", "post_clear"}:
        invalidate_marketplace_cache()
