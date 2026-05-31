"""
Admin configuration for the tenancy app.
"""
from __future__ import annotations

from django.contrib import admin

from .models import WorkshopTenant, WorkshopDomain, TenantOnboardingApplication


@admin.register(TenantOnboardingApplication)
class TenantOnboardingApplicationAdmin(admin.ModelAdmin):
    list_display = [
        "workshop_name",
        "business_registration_number",
        "admin_username",
        "admin_email",
        "status",
        "verification_code_confirmed_at",
        "created_at",
        "reviewed_at",
    ]
    list_filter = ["status"]
    search_fields = [
        "workshop_name",
        "business_registration_number",
        "admin_username",
        "admin_email",
        "verification_code",
    ]
    ordering = ["-created_at"]
    readonly_fields = [
        "admin_password_hash",
        "verification_code",
        "verification_code_confirmed_at",
        "verification_code_confirmed_by",
        "reviewed_by",
        "reviewed_at",
        "tenant",
    ]


@admin.register(WorkshopTenant)
class WorkshopTenantAdmin(admin.ModelAdmin):
    list_display = [
        "name",
        "business_registration_number",
        "schema_name",
        "subscription_plan",
        "is_active",
        "created_at",
    ]
    list_filter = ["subscription_plan", "is_active"]
    search_fields = ["name", "schema_name", "business_registration_number"]
    ordering = ["-created_at"]


@admin.register(WorkshopDomain)
class WorkshopDomainAdmin(admin.ModelAdmin):
    list_display = ["domain", "tenant", "is_primary"]
    list_filter = ["is_primary"]
    search_fields = ["domain", "tenant__name"]
    ordering = ["domain"]
