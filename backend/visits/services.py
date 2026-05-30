"""
Visit workflow services — multi-step operations that must not live in views alone.
"""
from __future__ import annotations

from django.core.exceptions import ValidationError

from vehicles.models import ServiceVisit

from .completion import apply_visit_completion_effects


def finish_service_visit(
    visit: ServiceVisit,
    *,
    mileage_km: int | None = None,
    hour_meter: int | None = None,
    notes: str | None = None,
) -> ServiceVisit:
    """
    Validate workflow rules and mark a visit completed.

    The 360° inspection is *optional* — a workshop may finish a visit without
    one (e.g. a quick oil change). If an inspection was filled in, it will be
    included in the printed report; otherwise the inspection section is
    suppressed entirely.
    """
    if visit.status == ServiceVisit.Status.CANCELLED:
        raise ValidationError(f"Cannot finish visit in '{visit.status}' status.")

    if visit.status == ServiceVisit.Status.COMPLETED:
        update_fields: list[str] = ["updated_at"]
        if mileage_km is not None:
            visit.mileage_km = int(mileage_km)
            update_fields.append("mileage_km")
        if hour_meter is not None:
            visit.hour_meter = int(hour_meter)
            update_fields.append("hour_meter")
        if notes is not None:
            visit.notes = notes
            update_fields.append("notes")
        if len(update_fields) > 1:
            visit.save(update_fields=update_fields)
            apply_visit_completion_effects(visit)
        return visit

    if mileage_km is not None:
        visit.mileage_km = int(mileage_km)
    if hour_meter is not None:
        visit.hour_meter = int(hour_meter)
    if notes is not None:
        visit.notes = notes

    visit.status = ServiceVisit.Status.COMPLETED
    visit.save(
        update_fields=["status", "mileage_km", "hour_meter", "notes", "updated_at"],
    )
    apply_visit_completion_effects(visit)
    _resolve_pm_after_visit(visit)
    return visit


def _resolve_pm_after_visit(visit: ServiceVisit) -> None:
    tenant = getattr(getattr(visit, "created_by", None), "tenant", None)
    if tenant is None:
        from django.db import connection

        tenant = getattr(connection, "tenant", None)
    if tenant is None:
        return
    try:
        from visits.visit_side_effects import resolve_pm_on_visit_completed

        resolve_pm_on_visit_completed(visit, tenant=tenant)
    except Exception:
        import logging

        logging.getLogger(__name__).exception("PM resolution failed for visit %s", visit.id)


def complete_in_progress_visit(visit: ServiceVisit) -> ServiceVisit:
    """Transition in_progress → completed. Inspection is optional."""
    if visit.status != ServiceVisit.Status.IN_PROGRESS:
        raise ValidationError(
            f"Cannot complete visit in '{visit.status}' status. Must be in progress."
        )
    visit.status = ServiceVisit.Status.COMPLETED
    visit.save(update_fields=["status", "updated_at"])
    apply_visit_completion_effects(visit)
    _resolve_pm_after_visit(visit)
    return visit
