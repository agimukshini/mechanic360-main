"""
Admin configuration for the tenancy app.
"""
from __future__ import annotations

from django.contrib import admin

from .models import WorkshopTenant, WorkshopDomain


@admin.register(WorkshopTenant)
class WorkshopTenantAdmin(admin.ModelAdmin):
    list_display = ["name", "schema_name", "subscription_plan", "is_active", "created_at"]
    list_filter = ["subscription_plan", "is_active"]
    search_fields = ["name", "schema_name"]
    ordering = ["-created_at"]


@admin.register(WorkshopDomain)
class WorkshopDomainAdmin(admin.ModelAdmin):
    list_display = ["domain", "tenant", "is_primary"]
    list_filter = ["is_primary"]
    search_fields = ["domain", "tenant__name"]
    ordering = ["domain"]
