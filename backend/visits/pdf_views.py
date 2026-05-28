"""
PDF report generation for service visits, door stickers, and digital service booklets.

Uses WeasyPrint to convert HTML templates to PDF documents.
"""
from __future__ import annotations

from django.http import HttpResponse
from django.template.loader import render_to_string
from django.utils import timezone
from rest_framework.decorators import api_view, permission_classes, renderer_classes
from rest_framework.response import Response
from weasyprint import HTML

from mechanic360.permissions import IsTenantUser
from vehicles.models import ServiceVisit
from visits.models import VisitLaborLine, VisitMaterialLine, VisitServiceLine

from .renderers import REPORT_RENDERER_CLASSES
from .report_labels import api_error
from .report_utils import (
    build_booklet_visit_blocks,
    client_display_name,
    flatten_inspection_rows,
    mechanic_display_name,
    tenant_language_from_request,
    vehicle_global_owner,
    visit_customer_client,
    visit_has_line_attribution,
    workshop_context_from_request,
)


@api_view(["GET"])
@permission_classes([IsTenantUser])
@renderer_classes(REPORT_RENDERER_CLASSES)
def generate_service_report(request, visit_id: str):
    """
    Generate a PDF service report for a completed visit.
    """
    lang = tenant_language_from_request(request)

    try:
        visit = ServiceVisit.objects.select_related(
            "vehicle",
            "vehicle__owner",
            "client",
            "created_by",
            "inspection",
            "inspection__performed_by",
        ).get(id=visit_id)
    except ServiceVisit.DoesNotExist:
        return Response({"error": api_error("visit_not_found", lang)}, status=404)

    if visit.status != ServiceVisit.Status.COMPLETED:
        return Response(
            {"error": api_error("report_completed_only", lang)},
            status=400,
        )

    service_lines = VisitServiceLine.objects.filter(visit=visit).select_related(
        "catalog_item",
        "performed_by",
    )
    material_lines = VisitMaterialLine.objects.filter(visit=visit).select_related("inventory_item")
    labor_lines = VisitLaborLine.objects.filter(visit=visit).select_related("performed_by")
    inspection = getattr(visit, "inspection", None)
    report_client = visit_customer_client(visit)
    customer_name = client_display_name(report_client)

    service_total = sum(float(line.total_price) for line in service_lines)
    material_total = sum(float(line.total_price) for line in material_lines)
    labor_total = sum(float(line.total_price) for line in labor_lines)
    grand_total = service_total + material_total + labor_total

    workshop = workshop_context_from_request(request)
    visit_ref = str(visit.id).replace("-", "").upper()[:8]

    context = {
        "visit": visit,
        "visit_ref": visit_ref,
        "vehicle": visit.vehicle,
        "client": report_client,
        "client_name": customer_name,
        "inspection": inspection,
        "inspection_rows": flatten_inspection_rows(inspection),
        "service_lines": service_lines,
        "material_lines": material_lines,
        "labor_lines": labor_lines,
        "service_total": service_total,
        "material_total": material_total,
        "labor_total": labor_total,
        "grand_total": grand_total,
        "generated_at": timezone.now(),
        "technician_name": mechanic_display_name(
            visit, inspection, customer_name=customer_name
        ),
        "show_line_technicians": visit_has_line_attribution(visit),
        **workshop,
    }

    html_content = render_to_string("reports/service_report.html", context)
    pdf = HTML(string=html_content, base_url=request.build_absolute_uri("/")).write_pdf()

    disposition = request.query_params.get("disposition", "attachment").lower()
    filename = f"service-report-{visit_ref}.pdf"
    if disposition == "inline":
        content_disposition = f'inline; filename="{filename}"'
    else:
        content_disposition = f'attachment; filename="{filename}"'

    response = HttpResponse(pdf, content_type="application/pdf")
    response["Content-Disposition"] = content_disposition
    response["Cache-Control"] = "no-store"
    return response


@api_view(["GET"])
@permission_classes([IsTenantUser])
@renderer_classes(REPORT_RENDERER_CLASSES)
def generate_door_sticker(request, visit_id: str):
    """
    Generate a door sticker PDF for a completed visit.
    """
    lang = tenant_language_from_request(request)

    try:
        visit = ServiceVisit.objects.select_related("vehicle", "vehicle__owner").get(id=visit_id)
    except ServiceVisit.DoesNotExist:
        return Response({"error": api_error("visit_not_found", lang)}, status=404)

    html_content = render_to_string(
        "reports/door_sticker.html",
        {
            "visit": visit,
            "vehicle": visit.vehicle,
            **workshop_context_from_request(request),
        },
    )

    pdf = HTML(string=html_content).write_pdf()

    response = HttpResponse(pdf, content_type="application/pdf")
    response["Content-Disposition"] = f'attachment; filename="door-sticker-{visit_id}.pdf"'
    return response


@api_view(["GET"])
@permission_classes([IsTenantUser])
@renderer_classes(REPORT_RENDERER_CLASSES)
def generate_service_booklet(request, vehicle_id: str):
    """
    Generate a vehicle history PDF: all completed visits for one vehicle,
    including services, parts, labor, and 360° inspection results per visit.

    Optional query params:
    - year: calendar year (e.g. 2025) or "all" for entire history
    - disposition: attachment (default) or inline
    """
    from vehicles.models import Vehicle

    lang = tenant_language_from_request(request)

    try:
        vehicle = Vehicle.objects.select_related("owner").get(id=vehicle_id)
    except Vehicle.DoesNotExist:
        return Response({"error": api_error("vehicle_not_found", lang)}, status=404)

    workshop = workshop_context_from_request(request)
    l_booklet = workshop["L_booklet"]

    visits = (
        ServiceVisit.objects.filter(vehicle=vehicle, status=ServiceVisit.Status.COMPLETED)
        .select_related(
            "vehicle",
            "vehicle__owner",
            "client",
            "created_by",
            "inspection",
            "inspection__performed_by",
        )
        .prefetch_related(
            "service_lines__catalog_item",
            "service_lines__performed_by",
            "material_lines__inventory_item",
            "labor_lines__performed_by",
        )
        .order_by("-service_date")
    )

    year_param = (request.query_params.get("year") or "").strip()
    period_label = ""
    if year_param and year_param.lower() != "all":
        try:
            year_int = int(year_param)
        except ValueError:
            return Response({"error": api_error("invalid_year", lang)}, status=400)
        visits = visits.filter(service_date__year=year_int)
        period_label = l_booklet.get("period_year", "{year}").replace("{year}", str(year_int))
    elif year_param.lower() == "all":
        period_label = l_booklet.get("period_all", "")

    visit_blocks, grand_total = build_booklet_visit_blocks(visits)
    visit_count = len(visit_blocks)

    plate_slug = (vehicle.license_plate or "vehicle").replace(" ", "")
    if year_param and year_param.lower() != "all":
        filename = f"vehicle-history-{plate_slug}-{year_param}.pdf"
    else:
        filename = f"vehicle-history-{plate_slug}.pdf"

    # Resolve booklet "owner" card via local owner first, then global registry.
    booklet_client = vehicle.owner
    if booklet_client is None:
        global_owner = vehicle_global_owner(vehicle)
        if global_owner is not None:
            from .report_utils import _GlobalOwnerClient

            booklet_client = _GlobalOwnerClient(
                name=getattr(global_owner, "name", "") or "",
                phone=getattr(global_owner, "phone", "") or "",
                email=getattr(global_owner, "email", "") or "",
            )

    html_content = render_to_string(
        "reports/service_booklet.html",
        {
            "vehicle": vehicle,
            "client": booklet_client,
            "visit_blocks": visit_blocks,
            "visit_count": visit_count,
            "grand_total": grand_total,
            "period_label": period_label,
            "generated_at": timezone.now(),
            **workshop,
        },
    )

    pdf = HTML(
        string=html_content,
        base_url=request.build_absolute_uri("/"),
    ).write_pdf()

    disposition = request.query_params.get("disposition", "attachment").lower()
    if disposition == "inline":
        content_disposition = f'inline; filename="{filename}"'
    else:
        content_disposition = f'attachment; filename="{filename}"'

    response = HttpResponse(pdf, content_type="application/pdf")
    response["Content-Disposition"] = content_disposition
    response["Cache-Control"] = "no-store"
    return response
