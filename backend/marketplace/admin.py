"""
Admin configuration for marketplace app.
"""
from __future__ import annotations

from django.contrib import admin
from .models import MarketplaceListing


@admin.register(MarketplaceListing)
class MarketplaceListingAdmin(admin.ModelAdmin):
    list_display = [
        'title',
        'tenant',
        'category',
        'price',
        'quantity_available',
        'is_active',
        'is_sold',
        'created_at',
    ]
    list_filter = ['category', 'is_active', 'is_sold', 'tenant']
    search_fields = ['title', 'description', 'tenant__name']
    readonly_fields = ['created_at', 'updated_at']
    ordering = ['-created_at']
