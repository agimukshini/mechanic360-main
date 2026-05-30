"""Helpers for cross-tenant preventive maintenance work orders."""
from __future__ import annotations

from datetime import date
from typing import Iterable
from uuid import UUID

from django.db.models import Q
from django.utils import timezone
from django_tenants.utils import get_tenant_model, schema_context

from .models import GlobalVehicle, PreventiveMaintenanceOrder
from .pm_kinds import PMKind


def default_title_for_kind(pm_kind: str) -> str:
    try:
        return PMKind(pm_kind).label
    except ValueError:
        return pm_kind.replace("_", " ").title()


def get_tenant_offered_pm_kinds(tenant) -> set[str]:
    """PM kinds this workshop can perform (from active catalog items)."""
    if tenant is None:
        return set()
    from visits.models import ServiceCatalogItem

    with schema_context(tenant.schema_name):
        return set(
            ServiceCatalogItem.objects.filter(is_active=True)
            .exclude(pm_kind="")
            .values_list("pm_kind", flat=True)
            .distinct(),
        )


def get_tenant_global_vehicle_ids(tenant) -> set[UUID]:
    """Global vehicle IDs registered in this workshop."""
    if tenant is None:
        return set()
    from vehicles.models import Vehicle

    with schema_context(tenant.schema_name):
        return {
            row
            for row in Vehicle.objects.filter(
                is_active=True,
                global_vehicle_id__isnull=False,
            ).values_list("global_vehicle_id", flat=True)
            if row
        }


def filter_orders_for_tenant(
    queryset,
    tenant,
    *,
    offered_kinds: set[str] | None = None,
    vehicle_ids: set[UUID] | None = None,
):
    offered = offered_kinds if offered_kinds is not None else get_tenant_offered_pm_kinds(tenant)
    if not offered:
        return queryset.none()
    gv_ids = vehicle_ids if vehicle_ids is not None else get_tenant_global_vehicle_ids(tenant)
    if not gv_ids:
        return queryset.none()
    return queryset.filter(
        global_vehicle_id__in=gv_ids,
        pm_kind__in=offered,
    )


def upsert_open_pm_order(
    *,
    global_vehicle_id: UUID,
    pm_kind: str,
    due_date: date | None = None,
    due_odometer_km: int | None = None,
    notes: str = "",
    source_plan_id: UUID | None = None,
    created_by_tenant=None,
    created_by=None,
) -> PreventiveMaintenanceOrder | None:
    if not global_vehicle_id or pm_kind not in PMKind.values:
        return None
    try:
        global_vehicle = GlobalVehicle.objects.get(pk=global_vehicle_id)
    except GlobalVehicle.DoesNotExist:
        return None

    existing = PreventiveMaintenanceOrder.objects.filter(
        global_vehicle=global_vehicle,
        pm_kind=pm_kind,
        status=PreventiveMaintenanceOrder.Status.OPEN,
    ).first()
    if existing:
        changed = False
        if due_date and existing.due_date != due_date:
            existing.due_date = due_date
            changed = True
        if due_odometer_km is not None and existing.due_odometer_km != due_odometer_km:
            existing.due_odometer_km = due_odometer_km
            changed = True
        if notes and notes != existing.notes:
            existing.notes = notes
            changed = True
        if source_plan_id and existing.source_plan_id != source_plan_id:
            existing.source_plan_id = source_plan_id
            changed = True
        if changed:
            existing.save()
        return existing

    return PreventiveMaintenanceOrder.objects.create(
        global_vehicle=global_vehicle,
        pm_kind=pm_kind,
        status=PreventiveMaintenanceOrder.Status.OPEN,
        due_date=due_date,
        due_odometer_km=due_odometer_km,
        title=default_title_for_kind(pm_kind),
        notes=notes,
        source_plan_id=source_plan_id,
        created_by_tenant=created_by_tenant,
        created_by=created_by,
    )


def complete_pm_order(order: PreventiveMaintenanceOrder, *, tenant=None) -> PreventiveMaintenanceOrder:
    order.status = PreventiveMaintenanceOrder.Status.COMPLETED
    order.completed_at = timezone.now()
    if tenant is not None:
        order.completed_by_tenant = tenant
    order.save(update_fields=["status", "completed_at", "completed_by_tenant", "updated_at"])
    return order


def sync_pm_order_from_plan(plan, vehicle, tenant) -> PreventiveMaintenanceOrder | None:
    """Create/update an open PM order when a tenant maintenance plan is due."""
    global_id = getattr(vehicle, "global_vehicle_id", None)
    pm_kind = getattr(plan, "pm_kind", "") or PMKind.REGULAR
    if not global_id or not pm_kind:
        return None

    next_due = _calculate_plan_next_due(plan)
    due_date = next_due.get("date") if next_due else None
    due_odometer = next_due.get("mileage") if next_due else None

    return upsert_open_pm_order(
        global_vehicle_id=global_id,
        pm_kind=pm_kind,
        due_date=due_date,
        due_odometer_km=due_odometer,
        notes=plan.notes or "",
        source_plan_id=plan.id,
        created_by_tenant=tenant,
    )


def _calculate_plan_next_due(plan) -> dict | None:
    from visits.maintenance_schedule import calculate_next_due

    return calculate_next_due(plan)


def sync_due_pm_orders_across_tenants() -> int:
    """
    Walk every tenant schema; for due maintenance plans, upsert public PM orders.
    Called from the daily Celery beat task.
    """
    from visits.maintenance_schedule import calculate_next_due, is_maintenance_due
    from visits.models import PreventiveMaintenancePlan
    from vehicles.models import Vehicle

    Tenant = get_tenant_model()
    synced = 0
    for tenant in Tenant.objects.exclude(schema_name="public"):
        with schema_context(tenant.schema_name):
            plans = PreventiveMaintenancePlan.objects.filter(is_active=True).select_related("vehicle")
            for plan in plans:
                vehicle = plan.vehicle
                if not vehicle.global_vehicle_id:
                    continue
                next_due = calculate_next_due(plan)
                if not next_due:
                    continue
                due, _reason = is_maintenance_due(plan, next_due)
                if not due:
                    continue
                if sync_pm_order_from_plan(plan, vehicle, tenant):
                    synced += 1
    return synced
