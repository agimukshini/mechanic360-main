"""
Admin configuration for the inventory app.
"""
from __future__ import annotations

from django.contrib import admin

from .models import InventoryItem


@admin.register(InventoryItem)
class InventoryItemAdmin(admin.ModelAdmin):
    list_display = ["sku", "name", "manufacturer", "current_stock", "minimum_stock", "sale_price"]
    list_filter = ["manufacturer", "supplier"]
    search_fields = ["sku", "name", "manufacturer", "supplier"]
    ordering = ["name"]
