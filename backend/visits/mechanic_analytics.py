"""Per-mechanic KPI aggregation for workshop analytics."""
from __future__ import annotations

from datetime import timedelta
from decimal import Decimal

from django.contrib.auth import get_user_model
from django.db.models import Count, Q, Sum
from django.db.models.functions import TruncDate, TruncWeek
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


def _rows_for_export(request, days: int):
    since = _period_start(days)
    return [_stats_for_mechanic(mechanic, since) for mechanic in _mechanics_for_request(request)]


def _visits_over_time(mechanic, since, days: int) -> list[dict]:
    qs = _visit_filter_for_mechanic(mechanic, since).filter(
        status=ServiceVisit.Status.COMPLETED,
    )
    if days <= 31:
        grouped = (
            qs.annotate(period=TruncDate("service_date"))
            .values("period")
            .annotate(visits=Count("id"))
            .order_by("period")
        )
        return [
            {"period": row["period"].strftime("%Y-%m-%d"), "visits": row["visits"]}
            for row in grouped
            if row["period"]
        ]

    grouped = (
        qs.annotate(period=TruncWeek("service_date"))
        .values("period")
        .annotate(visits=Count("id"))
        .order_by("period")
    )
    return [
        {
            "period": row["period"].strftime("%Y-W%W") if row["period"] else "",
            "visits": row["visits"],
        }
        for row in grouped
        if row["period"]
    ]


def _top_services(mechanic, since, limit: int = 8) -> list[dict]:
    rows = (
        VisitServiceLine.objects.filter(
            performed_by=mechanic,
            visit__service_date__gte=since,
        )
        .values("description")
        .annotate(count=Count("id"), revenue=Sum("total_price"))
        .order_by("-count")[:limit]
    )
    return [
        {
            "service": (row["description"] or "—")[:120],
            "count": row["count"],
            "revenue": float(row["revenue"] or 0),
        }
        for row in rows
    ]


def mechanics_export_csv(request):
    """Download mechanic KPI summary as CSV."""
    import csv
    from django.http import HttpResponse

    days = int(request.query_params.get("days", 30))
    rows = _rows_for_export(request, days)

    response = HttpResponse(content_type="text/csv")
    response["Content-Disposition"] = f'attachment; filename="mechanic-kpis-{days}d.csv"'
    writer = csv.writer(response)
    writer.writerow(
        [
            "username",
            "first_name",
            "last_name",
            "visits_completed",
            "service_lines",
            "labor_hours",
            "revenue_total",
            "vehicles_touched",
        ],
    )
    for row in rows:
        user = row["user"]
        writer.writerow(
            [
                user.get("username", ""),
                user.get("first_name", ""),
                user.get("last_name", ""),
                row["visits_completed"],
                row["service_lines"],
                row["labor_hours"],
                row["revenue_total"],
                row["vehicles_touched"],
            ],
        )
    return response


def mechanics_export_pdf(request):
    """Download mechanic KPI summary as a simple PDF table."""
    from django.http import HttpResponse
    from django.utils.html import escape
    from weasyprint import HTML

    days = int(request.query_params.get("days", 30))
    rows = _rows_for_export(request, days)
    generated = timezone.now().strftime("%Y-%m-%d %H:%M")

    table_rows = ""
    for row in rows:
        user = row["user"]
        name = escape(
            " ".join(
                part
                for part in [user.get("first_name", ""), user.get("last_name", "")]
                if part
            ).strip()
            or user.get("username", ""),
        )
        table_rows += (
            f"<tr>"
            f"<td>{name}</td>"
            f"<td>{row['visits_completed']}</td>"
            f"<td>{row['labor_hours']:.1f}</td>"
            f"<td>{row['revenue_total']:.2f}</td>"
            f"<td>{row['vehicles_touched']}</td>"
            f"</tr>"
        )

    html = f"""
    <!DOCTYPE html>
    <html><head><meta charset="utf-8">
    <style>
      body {{ font-family: sans-serif; font-size: 11pt; color: #1B263B; }}
      h1 {{ font-size: 16pt; color: #0077B6; margin-bottom: 4px; }}
      p.meta {{ color: #666; font-size: 9pt; margin-top: 0; }}
      table {{ width: 100%; border-collapse: collapse; margin-top: 16px; }}
      th, td {{ border: 1px solid #ddd; padding: 6px 8px; text-align: left; }}
      th {{ background: #f3f4f6; font-size: 9pt; text-transform: uppercase; }}
    </style></head><body>
    <h1>Mechanic KPI summary</h1>
    <p class="meta">Period: last {days} days · Generated {escape(generated)}</p>
    <table>
      <thead><tr>
        <th>Mechanic</th><th>Visits</th><th>Labor h</th><th>Revenue</th><th>Vehicles</th>
      </tr></thead>
      <tbody>{table_rows or '<tr><td colspan="5">No data</td></tr>'}</tbody>
    </table>
    </body></html>
    """
    pdf = HTML(string=html).write_pdf()
    response = HttpResponse(pdf, content_type="application/pdf")
    response["Content-Disposition"] = f'attachment; filename="mechanic-kpis-{days}d.pdf"'
    return response


def mechanics_export(request):
    export_as = (request.query_params.get("export_as") or request.query_params.get("format") or "csv").lower()
    if export_as == "pdf":
        return mechanics_export_pdf(request)
    return mechanics_export_csv(request)


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
            "visits_over_time": _visits_over_time(mechanic, since, days),
            "top_services": _top_services(mechanic, since),
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
