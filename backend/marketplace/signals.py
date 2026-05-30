from __future__ import annotations

from django.db.models.signals import post_save
from django.dispatch import receiver

from .legacy_sync import mirror_legacy_listing
from .models import MarketplaceListing


@receiver(post_save, sender=MarketplaceListing)
def sync_legacy_listing_to_catalog(sender, instance: MarketplaceListing, **kwargs):
    mirror_legacy_listing(instance)
