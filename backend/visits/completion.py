"""
Side effects and validation when a service visit is finished (completed).
"""
from __future__ import annotations

from django.core.exceptions import ValidationError

from vehicles.models import Inspection, ServiceVisit, Vehicle


def inspection_has_content(inspection: Inspection | None) -> bool:
    """True when the inspection JSON has at least one completed checklist item."""
    if not inspection or not inspection.data or not isinstance(inspection.data, dict):
        return False
    return any(
        isinstance(section, dict) and len(section) > 0
        for section in inspection.data.values()
    )


def assert_visit_has_inspection(visit: ServiceVisit) -> None:
    """
    Every completed visit must include a 360° inspection (working scope §5–§6).
    """
    try:
        inspection = visit.inspection
    except (Inspection.DoesNotExist, AttributeError):
        raise ValidationError(
            "A 360° inspection is required before completing this visit. "
            "Complete the inspection checklist first."
        ) from None
    if not inspection_has_content(inspection):
        raise ValidationError(
            "The 360° inspection checklist is empty. "
            "Complete at least one inspection item before finishing the visit."
        )


def baseline_mileage_km_for_vehicle(vehicle: Vehicle) -> int:
    """
    Best starting mileage for a new visit: vehicle odometer or latest completed visit.
    """
    base = vehicle.odometer_km or 0
    latest = (
        ServiceVisit.objects.filter(
            vehicle=vehicle,
            status=ServiceVisit.Status.COMPLETED,
        )
        .order_by("-service_date", "-created_at")
        .values_list("mileage_km", flat=True)
        .first()
    )
    return max(base, latest or 0)


def apply_visit_completion_effects(visit: ServiceVisit) -> None:
    """Update vehicle odometer and hour meter from visit readings when finishing."""
    vehicle = visit.vehicle
    update_fields: list[str] = []

    mileage = visit.mileage_km or 0
    if mileage > 0:
        vehicle.odometer_km = max(vehicle.odometer_km or 0, mileage)
        update_fields.append("odometer_km")

    hours = visit.hour_meter or 0
    if hours > 0:
        vehicle.hour_meter = max(vehicle.hour_meter or 0, hours)
        update_fields.append("hour_meter")

    if update_fields:
        update_fields.append("updated_at")
        vehicle.save(update_fields=update_fields)
