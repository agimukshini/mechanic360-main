"""
Side effects when a service visit is finished (completed).
"""
from __future__ import annotations

from vehicles.models import ServiceVisit, Vehicle


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
    """Update vehicle odometer from visit mileage when finishing."""
    vehicle = visit.vehicle
    mileage = visit.mileage_km or 0
    if mileage <= 0:
        return
    vehicle.odometer_km = max(vehicle.odometer_km or 0, mileage)
    vehicle.save(update_fields=["odometer_km", "updated_at"])
