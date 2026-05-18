"""
Serializers for inventory management.

These implement the "inventory management" requirement.
"""
from __future__ import annotations

from rest_framework import serializers

from .models import InventoryItem


class InventoryItemSerializer(serializers.ModelSerializer):
    """
    Basic serializer for inventory item records.

    Tenants can freely create/update/delete their own inventory items.
    """

    class Meta:
        model = InventoryItem
        fields = [
            "id",
            "sku",
            "name",
            "manufacturer",
            "purchase_cost",
            "sale_price",
            "current_stock",
            "minimum_stock",
            "supplier",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["id", "created_at", "updated_at"]
