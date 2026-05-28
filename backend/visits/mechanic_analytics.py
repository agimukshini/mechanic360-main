"""Per-mechanic KPI aggregation for workshop analytics."""
from __future__ import annotations

from datetime import timedelta
from decimal import Decimal

from django.contrib.auth import get_user_model
from django.db.models import Q, Sum
from django.utils import timezone
from rest_framework.exceptions import NotFound, PermissionDenied
from rest_framework.response import Response

from accounts.serializers import UserSerializer
from mechanic360.permissions import STAFF_ROLES
from vehicles.models import ServiceVisit
from visits.models import VisitLaborLine, VisitServiceLine

User = get_user_model()


def _period_start(days: int):
    return timezone.now() - timedelta(days=max(days, 1))


def _mechanics_for_request(request):
    user = request.user
    qs = User.objects.filter(
        tenant=user.tenant,
        role=User.Role.MECHANIC,
        is_active=True,
    ).order_by("first_name", "last_name", "username")
    if getattr(user, "role", None) == User.Role.MECHANIC:
        qs = qs.filter(pk=user.pk)
    elif getattr(user, "role", None) not in STAFF_ROLES:
        raise PermissionDenied("Workshop manager access required.")
    return qs


def _visit_filter_for_mechanic(mechanic, since):
    return (
        ServiceVisit.objects.filter(service_date__gte=since)
        .filter(
            Q(service_lines__performed_by=mechanic)
            | Q(labor_lines__performed_by=mechanic)
            | Q(created_by=mechanic)
            | Q(inspection__performed_by=mechanic)
        )
        .distinct()
    )


def _stats_for_mechanic(mechanic, since) -> dict:
    visits_qs = _visit_filter_for_mechanic(mechanic, since)
    completed_visits = visits_qs.filter(status=ServiceVisit.Status.COMPLETED).count()

    service_lines = VisitServiceLine.objects.filter(
        performed_by=mechanic,
        visit__service_date__gte=since,
    )
    labor_lines = VisitLaborLine.objects.filter(
        performed_by=mechanic,
        visit__service_date__gte=since,
    )

    service_revenue = service_lines.aggregate(total=Sum("total_price"))["total"] or Decimal("0")
    labor_revenue = labor_lines.aggregate(total=Sum("total_price"))["total"] or Decimal("0")
    labor_hours = labor_lines.aggregate(total=Sum("hours"))["total"] or Decimal("0")

    vehicles_touched = visits_qs.values("vehicle_id").distinct().count()

    return {
        "user": UserSerializer(mechanic).data,
        "visits_total": visits_qs.count(),
        "visits_completed": completed_visits,
        "service_lines": service_lines.count(),
        "labor_lines": labor_lines.count(),
        "labor_hours": float(labor_hours),
        "service_revenue": float(service_revenue),
        "labor_revenue": float(labor_revenue),
        "revenue_total": float(service_revenue + labor_revenue),
        "vehicles_touched": vehicles_touched,
    }


def mechanics_summary(request):
    days = int(request.query_params.get("days", 30))
    since = _period_start(days)
    rows = [_stats_for_mechanic(mechanic, since) for mechanic in _mechanics_for_request(request)]
    return Response({"days": days, "mechanics": rows})


def mechanic_detail(request, user_id: str):
    days = int(request.query_params.get("days", 30))
    since = _period_start(days)
    try:
        mechanic = _mechanics_for_request(request).get(pk=user_id)
    except User.DoesNotExist as exc:
        raise NotFound("Mechanic not found.") from exc

    visits = (
        _visit_filter_for_mechanic(mechanic, since)
        .select_related("vehicle")
        .order_by("-service_date")[:50]
    )
    visit_rows = [
        {
            "id": str(visit.id),
            "status": visit.status,
            "service_date": visit.service_date,
            "vehicle": {
                "id": str(visit.vehicle_id),
                "license_plate": visit.vehicle.license_plate,
                "make": visit.vehicle.make,
                "model": visit.vehicle.model,
            },
            "mileage_km": visit.mileage_km,
        }
        for visit in visits
    ]

    service_lines = (
        VisitServiceLine.objects.filter(performed_by=mechanic, visit__service_date__gte=since)
        .select_related("visit", "visit__vehicle")
        .order_by("-visit__service_date")[:100]
    )
    labor_lines = (
        VisitLaborLine.objects.filter(performed_by=mechanic, visit__service_date__gte=since)
        .select_related("visit", "visit__vehicle")
        .order_by("-visit__service_date")[:100]
    )

    return Response(
        {
            "days": days,
            "summary": _stats_for_mechanic(mechanic, since),
            "recent_visits": visit_rows,
            "recent_service_lines": [
                {
                    "id": str(line.id),
                    "description": line.description,
                    "total_price": float(line.total_price),
                    "visit_id": str(line.visit_id),
                    "vehicle_plate": line.visit.vehicle.license_plate,
                }
                for line in service_lines
            ],
            "recent_labor_lines": [
                {
                    "id": str(line.id),
                    "description": line.description,
                    "hours": float(line.hours),
                    "total_price": float(line.total_price),
                    "visit_id": str(line.visit_id),
                    "vehicle_plate": line.visit.vehicle.license_plate,
                }
                for line in labor_lines
            ],
        }
    )
