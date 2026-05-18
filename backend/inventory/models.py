"""
Inventory model for the Mechanic360 platform.

Moved from vehicles.models to inventory.models to match the app structure
expected by settings.py and urls.py.
"""
from __future__ import annotations

import uuid

from django.db import models


class InventoryItem(models.Model):
    """
    Parts & materials stored by the workshop.

    This is per-tenant (per schema). Stock changes can be stored via a separate
    movement / ledger model later for full audit trails.
    """

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)

    sku = models.CharField(max_length=64, unique=True)
    name = models.CharField(max_length=255)
    manufacturer = models.CharField(max_length=255, blank=True)

    purchase_cost = models.DecimalField(max_digits=10, decimal_places=2)
    sale_price = models.DecimalField(max_digits=10, decimal_places=2)

    current_stock = models.IntegerField(default=0)
    minimum_stock = models.IntegerField(default=0)

    supplier = models.CharField(max_length=255, blank=True)

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["name"]

    def __str__(self) -> str:
        return f"{self.sku} - {self.name}"
