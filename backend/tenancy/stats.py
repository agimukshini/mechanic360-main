"""
Platform-wide statistics for superadmin dashboard.

Global counts live in the public schema. Per-tenant counts require switching
into each tenant's PostgreSQL schema.
"""
from __future__ import annotations

from dataclasses import dataclass

from django.contrib.auth import get_user_model
from django.db import connection

from clients.models import Client
from global_vehicles.models import GlobalOwner, GlobalVehicle, VehicleClaimToken
from inventory.models import InventoryItem
from marketplace.models import MarketplaceListing
from vehicles.models import Inspection, ServiceVisit, Vehicle

from .models import TenantOnboardingApplication, WorkshopTenant

User = get_user_model()


@dataclass
class TenantUsageStats:
    users: int = 0
    clients: int = 0
    vehicles: int = 0
    visits: int = 0
    inspections: int = 0
    inventory_items: int = 0
    global_vehicles_registered: int = 0
    marketplace_listings: int = 0


@dataclass
class PlatformStats:
    tenants_total: int = 0
    tenants_active: int = 0
    tenants_inactive: int = 0
    pending_onboarding: int = 0
    users_total: int = 0
    owner_accounts: int = 0
    global_vehicles: int = 0
    global_owners: int = 0
    global_vehicles_active: int = 0
    marketplace_listings: int = 0
    claim_tokens_pending: int = 0


def collect_platform_stats() -> PlatformStats:
    return PlatformStats(
        tenants_total=WorkshopTenant.objects.count(),
        tenants_active=WorkshopTenant.objects.filter(is_active=True).count(),
        tenants_inactive=WorkshopTenant.objects.filter(is_active=False).count(),
        pending_onboarding=TenantOnboardingApplication.objects.filter(
            status=TenantOnboardingApplication.Status.PENDING,
        ).count(),
        users_total=User.objects.filter(tenant__isnull=False).count(),
        owner_accounts=User.objects.filter(role=User.Role.OWNER).count(),
        global_vehicles=GlobalVehicle.objects.count(),
        global_vehicles_active=GlobalVehicle.objects.filter(is_active=True).count(),
        global_owners=GlobalOwner.objects.count(),
        marketplace_listings=MarketplaceListing.objects.count(),
        claim_tokens_pending=VehicleClaimToken.objects.filter(used_at__isnull=True).count(),
    )


def collect_tenant_usage_stats(tenant: WorkshopTenant) -> TenantUsageStats:
    stats = TenantUsageStats(
        users=User.objects.filter(tenant=tenant).count(),
        global_vehicles_registered=GlobalVehicle.objects.filter(
            registered_by_tenant=tenant,
        ).count(),
        marketplace_listings=MarketplaceListing.objects.filter(tenant=tenant).count(),
    )

    previous_schema = connection.schema_name
    connection.set_schema(tenant.schema_name)
    try:
        stats.clients = Client.objects.count()
        stats.vehicles = Vehicle.objects.count()
        stats.visits = ServiceVisit.objects.count()
        stats.inspections = Inspection.objects.count()
        stats.inventory_items = InventoryItem.objects.count()
    finally:
        connection.set_schema(previous_schema)

    return stats


def tenant_usage_stats_dict(tenant: WorkshopTenant) -> dict:
    stats = collect_tenant_usage_stats(tenant)
    return {
        "users": stats.users,
        "clients": stats.clients,
        "vehicles": stats.vehicles,
        "visits": stats.visits,
        "inspections": stats.inspections,
        "inventory_items": stats.inventory_items,
        "global_vehicles_registered": stats.global_vehicles_registered,
        "marketplace_listings": stats.marketplace_listings,
    }


def platform_stats_dict() -> dict:
    stats = collect_platform_stats()
    return {
        "tenants_total": stats.tenants_total,
        "tenants_active": stats.tenants_active,
        "tenants_inactive": stats.tenants_inactive,
        "pending_onboarding": stats.pending_onboarding,
        "users_total": stats.users_total,
        "owner_accounts": stats.owner_accounts,
        "global_vehicles": stats.global_vehicles,
        "global_vehicles_active": stats.global_vehicles_active,
        "global_owners": stats.global_owners,
        "marketplace_listings": stats.marketplace_listings,
        "claim_tokens_pending": stats.claim_tokens_pending,
    }


def tenant_summary_dict(tenant: WorkshopTenant, *, include_stats: bool = True) -> dict:
    payload = {
        "id": str(tenant.id),
        "name": tenant.name,
        "schema_name": tenant.schema_name,
        "logo_url": tenant.logo_url,
        "address": tenant.address,
        "contact_email": tenant.contact_email,
        "contact_phone": tenant.contact_phone,
        "subscription_plan": tenant.subscription_plan,
        "is_active": tenant.is_active,
        "created_at": tenant.created_at,
        "updated_at": tenant.updated_at,
    }
    if include_stats:
        payload["stats"] = tenant_usage_stats_dict(tenant)
    return payload


def collect_dashboard_payload() -> dict:
    return {
        "platform": platform_stats_dict(),
        "tenants": [
            tenant_summary_dict(tenant)
            for tenant in WorkshopTenant.objects.order_by("name")
        ],
    }


def collect_global_registry_payload(*, recent_limit: int = 10) -> dict:
    platform = platform_stats_dict()
    recent_vehicles = GlobalVehicle.objects.select_related("registered_by_tenant").order_by(
        "-created_at"
    )[:recent_limit]

    return {
        "summary": {
            "global_vehicles": platform["global_vehicles"],
            "global_vehicles_active": platform["global_vehicles_active"],
            "global_owners": platform["global_owners"],
            "claim_tokens_pending": platform["claim_tokens_pending"],
            "owner_accounts": platform["owner_accounts"],
        },
        "recent_vehicles": [
            {
                "id": str(vehicle.id),
                "vin": vehicle.vin,
                "license_plate": vehicle.license_plate,
                "make": vehicle.make,
                "model": vehicle.model,
                "year": vehicle.year,
                "is_active": vehicle.is_active,
                "registered_by_tenant_name": (
                    vehicle.registered_by_tenant.name if vehicle.registered_by_tenant else None
                ),
                "created_at": vehicle.created_at,
            }
            for vehicle in recent_vehicles
        ],
    }
