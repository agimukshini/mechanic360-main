"""
Admin configuration for the visits app.
"""
from __future__ import annotations

from django.contrib import admin

from .models import (
    ServiceCatalogItem,
    VisitServiceLine,
    VisitMaterialLine,
    VisitLaborLine,
    PreventiveMaintenancePlan,
)


@admin.register(ServiceCatalogItem)
class ServiceCatalogItemAdmin(admin.ModelAdmin):
    list_display = ["name", "default_duration_hours", "default_price", "is_active"]
    list_filter = ["is_active"]
    search_fields = ["name", "description"]
    ordering = ["name"]


@admin.register(VisitServiceLine)
class VisitServiceLineAdmin(admin.ModelAdmin):
    list_display = ["id", "visit", "description", "quantity", "total_price"]
    search_fields = ["description", "visit__id"]
    ordering = ["id"]


@admin.register(VisitMaterialLine)
class VisitMaterialLineAdmin(admin.ModelAdmin):
    list_display = ["id", "visit", "inventory_item", "quantity", "total_price"]
    search_fields = ["visit__id", "inventory_item__name"]
    ordering = ["id"]


@admin.register(VisitLaborLine)
class VisitLaborLineAdmin(admin.ModelAdmin):
    list_display = ["id", "visit", "description", "hours", "total_price"]
    search_fields = ["description", "visit__id"]
    ordering = ["id"]


@admin.register(PreventiveMaintenancePlan)
class PreventiveMaintenancePlanAdmin(admin.ModelAdmin):
    list_display = ["name", "vehicle", "is_active", "last_service_date"]
    list_filter = ["is_active"]
    search_fields = ["name", "vehicle__license_plate"]
    ordering = ["name"]
