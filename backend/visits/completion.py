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
    """
    Update vehicle odometer and hour meter from the visit readings.

    Per `VEHICLE_SHARING_POLICY.md` §4.2 we propagate the latest reading
    to the platform-wide `GlobalVehicle` so the owner portal and any other
    workshop sees the freshest mileage. Both layers use a max() merge —
    odometers never go backwards, even if a stale visit closes after a
    later one.
    """
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

    if mileage > 0 or hours > 0:
        _propagate_readings_to_global(vehicle, mileage=mileage, hours=hours)


def _propagate_readings_to_global(vehicle: Vehicle, *, mileage: int, hours: int) -> None:
    """Bump the public GlobalVehicle row to the latest reading, max-merge."""
    global_id = getattr(vehicle, "global_vehicle_id", None)
    if not global_id:
        return
    try:
        from global_vehicles.models import GlobalVehicle
        from tenancy.views import public_schema
    except Exception:  # pragma: no cover — defensive
        return
    with public_schema():
        try:
            gv = GlobalVehicle.objects.get(id=global_id)
        except GlobalVehicle.DoesNotExist:
            return
        global_fields: list[str] = []
        if mileage > 0 and mileage > (gv.odometer_km or 0):
            gv.odometer_km = mileage
            global_fields.append("odometer_km")
        if hours > 0 and hours > (gv.hour_meter or 0):
            gv.hour_meter = hours
            global_fields.append("hour_meter")
        if global_fields:
            global_fields.append("updated_at")
            gv.save(update_fields=global_fields)
