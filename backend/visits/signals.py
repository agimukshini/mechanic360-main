"""
Django signals for visit material lines.

Automatically deducts inventory stock when materials are used in visits
and restores stock when material lines are deleted.
"""
from __future__ import annotations

from django.db.models.signals import post_delete
from django.dispatch import receiver

from .models import VisitMaterialLine


@receiver(post_delete, sender=VisitMaterialLine)
def restore_stock_on_material_delete(sender, instance, **kwargs):
    """
    Restore inventory stock when a material line is removed from a visit.
    """
    inventory_item = instance.inventory_item
    quantity_restored = instance.quantity

    inventory_item.current_stock += int(quantity_restored)
    inventory_item.save(update_fields=["current_stock", "updated_at"])
