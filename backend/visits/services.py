"""
Visit workflow services — multi-step operations that must not live in views alone.
"""
from __future__ import annotations

from django.core.exceptions import ValidationError

from vehicles.models import ServiceVisit

from .completion import apply_visit_completion_effects, assert_visit_has_inspection


def finish_service_visit(
    visit: ServiceVisit,
    *,
    mileage_km: int | None = None,
    hour_meter: int | None = None,
    notes: str | None = None,
) -> ServiceVisit:
    """
    Validate workflow rules and mark a visit completed.

    Raises ValidationError when the mandatory 360° inspection is missing or empty.
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

    assert_visit_has_inspection(visit)

    visit.status = ServiceVisit.Status.COMPLETED
    visit.save(
        update_fields=["status", "mileage_km", "hour_meter", "notes", "updated_at"],
    )
    apply_visit_completion_effects(visit)
    return visit


def complete_in_progress_visit(visit: ServiceVisit) -> ServiceVisit:
    """Transition in_progress → completed with inspection validation."""
    if visit.status != ServiceVisit.Status.IN_PROGRESS:
        raise ValidationError(
            f"Cannot complete visit in '{visit.status}' status. Must be in progress."
        )
    assert_visit_has_inspection(visit)
    visit.status = ServiceVisit.Status.COMPLETED
    visit.save(update_fields=["status", "updated_at"])
    apply_visit_completion_effects(visit)
    return visit
