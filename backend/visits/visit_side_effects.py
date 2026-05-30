"""Side effects when a vehicle checks in or a visit is completed."""
from __future__ import annotations

import logging

from django.conf import settings
from django.core.mail import send_mail
from django.utils import timezone
from tenancy.views import public_schema

logger = logging.getLogger(__name__)


def _principal_owner_for_vehicle(vehicle):
    global_id = getattr(vehicle, "global_vehicle_id", None)
    if not global_id:
        return None
    try:
        from global_vehicles.models import GlobalVehicle

        with public_schema():
            gv = GlobalVehicle.objects.prefetch_related("ownerships__owner").get(pk=global_id)
            return gv.current_owner
    except Exception:
        logger.exception("Failed to resolve principal owner for vehicle %s", vehicle.id)
        return None


def notify_principal_owner_on_check_in(visit, *, tenant) -> bool:
    """
    Notify the platform owner when their vehicle checks in at a workshop.

    Sends in-app notification (when the owner has a user account) and email.
    """
    owner = _principal_owner_for_vehicle(visit.vehicle)
    if owner is None:
        return False

    vehicle = visit.vehicle
    workshop_name = getattr(tenant, "name", "") or "Workshop"
    plate = vehicle.license_plate or ""
    title = f"Vehicle checked in at {workshop_name}"
    message = (
        f"Your vehicle ({vehicle.make} {vehicle.model}, {plate}) "
        f"was checked in at {workshop_name}."
    )
    link = f"/owner/vehicles/{vehicle.global_vehicle_id}"

    notified = False
    if owner.user_id:
        from accounts.notifications import Notification

        Notification.objects.create(
            user=owner.user,
            title=title,
            message=message,
            type=Notification.Type.INFO,
            link=link,
        )
        notified = True

    if owner.email:
        try:
            send_mail(
                subject=title,
                message=(
                    f"Dear {owner.name},\n\n"
                    f"{message}\n\n"
                    "You can view your vehicle in the Mechanic360 owner portal.\n\n"
                    "Best regards,\nMechanic360"
                ),
                from_email=settings.DEFAULT_FROM_EMAIL,
                recipient_list=[owner.email],
                fail_silently=True,
            )
            notified = True
        except Exception:
            logger.exception("Failed to email owner %s on check-in", owner.id)

    return notified


def resolve_pm_on_visit_completed(visit, *, tenant) -> int:
    """
    Close open PM work orders after a completed visit and refresh local plans.

    PM orders are only resolved when the vehicle has checked in and the visit
    is finished — workshops cannot mark PM done manually from the list.
    """
    vehicle = visit.vehicle
    global_id = getattr(vehicle, "global_vehicle_id", None)
    if not global_id:
        return 0

    from visits.models import PreventiveMaintenancePlan, VisitServiceLine
    from global_vehicles.models import PreventiveMaintenanceOrder
    from global_vehicles.pm_kinds import PMKind
    from global_vehicles.pm_services import complete_pm_order

    pm_kinds = {
        row
        for row in VisitServiceLine.objects.filter(visit=visit, catalog_item__isnull=False)
        .exclude(catalog_item__pm_kind="")
        .values_list("catalog_item__pm_kind", flat=True)
        .distinct()
        if row in PMKind.values
    }

    if not pm_kinds:
        return 0

    service_date = visit.service_date.date() if visit.service_date else timezone.now().date()
    mileage = visit.mileage_km

    for pm_kind in pm_kinds:
        PreventiveMaintenancePlan.objects.filter(
            vehicle=vehicle,
            pm_kind=pm_kind,
            is_active=True,
        ).update(
            last_service_date=service_date,
            last_mileage_km=mileage if mileage else None,
            updated_at=timezone.now(),
        )

    completed = 0
    with public_schema():
        orders = PreventiveMaintenanceOrder.objects.filter(
            global_vehicle_id=global_id,
            pm_kind__in=pm_kinds,
            status=PreventiveMaintenanceOrder.Status.OPEN,
        )
        for order in orders:
            complete_pm_order(order, tenant=tenant)
            completed += 1

    return completed
