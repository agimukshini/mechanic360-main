"""
Owner portal API — claim vehicles and manage personal inventory.
"""
from __future__ import annotations

from datetime import timedelta

from django.http import HttpResponse
from django.template.loader import render_to_string
from django.utils import timezone
from django_tenants.utils import get_tenant_model, schema_context
from rest_framework import generics, permissions, status, viewsets
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.views import APIView
from weasyprint import HTML

from mechanic360.permissions import IsOwnerUser

from .models import GlobalVehicle, VehicleOwnership
from .serializers import (
    ClaimVehicleSerializer,
    GlobalVehicleSerializer,
    OwnerRegisterSerializer,
    VehicleOwnershipSerializer,
    qr_code_response,
)
from .services import parse_claim_token_id, redeem_claim_token


def _aggregate_visits_for_global_vehicle(global_vehicle_id: str) -> list[dict]:
    """
    Walk every tenant schema, find the local `Vehicle` mirror for this global
    vehicle (matched by `global_vehicle_id`), and collect *completed* visits.

    Returns a list of plain dicts (sorted newest-first) so the caller never
    holds a tenant-scoped ORM instance outside its schema context — that would
    raise on lazy attribute access.
    """
    from vehicles.models import ServiceVisit, Vehicle
    from visits.models import VisitLaborLine, VisitMaterialLine, VisitServiceLine

    out: list[dict] = []
    Tenant = get_tenant_model()
    tenants = Tenant.objects.exclude(schema_name="public")

    for tenant in tenants:
        with schema_context(tenant.schema_name):
            local = Vehicle.objects.filter(global_vehicle_id=global_vehicle_id).first()
            if local is None:
                continue
            visits_qs = (
                ServiceVisit.objects.filter(
                    vehicle=local,
                    status=ServiceVisit.Status.COMPLETED,
                )
                .select_related("inspection", "inspection__performed_by")
                .order_by("-service_date")
            )
            for v in visits_qs:
                service_total = sum(
                    float(line.total_price)
                    for line in VisitServiceLine.objects.filter(visit=v)
                )
                material_total = sum(
                    float(line.total_price)
                    for line in VisitMaterialLine.objects.filter(visit=v)
                )
                labor_total = sum(
                    float(line.total_price)
                    for line in VisitLaborLine.objects.filter(visit=v)
                )
                out.append(
                    {
                        "visit_id": str(v.id),
                        "tenant_schema": tenant.schema_name,
                        "tenant_name": tenant.name,
                        "service_date": v.service_date,
                        "mileage_km": v.mileage_km,
                        "hour_meter": v.hour_meter,
                        "notes": v.notes or "",
                        "service_total": service_total,
                        "material_total": material_total,
                        "labor_total": labor_total,
                        "grand_total": service_total + material_total + labor_total,
                    }
                )

    out.sort(key=lambda r: r["service_date"], reverse=True)
    return out


class OwnerRegisterView(generics.CreateAPIView):
    """Public registration for vehicle owners."""

    serializer_class = OwnerRegisterSerializer
    permission_classes = [permissions.AllowAny]


class OwnerVehicleViewSet(viewsets.ReadOnlyModelViewSet):
    """Vehicles the authenticated owner has claimed."""

    serializer_class = GlobalVehicleSerializer
    permission_classes = [IsOwnerUser]

    def get_queryset(self):
        owner = self.request.user.global_owner_profile
        vehicle_ids = VehicleOwnership.objects.filter(
            owner=owner,
            effective_to__isnull=True,
        ).values_list("vehicle_id", flat=True)
        return GlobalVehicle.objects.filter(id__in=vehicle_ids).prefetch_related(
            "ownerships__owner",
        )

    @action(detail=True, methods=["get"], url_path="service-history")
    def service_history(self, request, pk=None):
        """
        Aggregated list of completed visits for this vehicle across every
        workshop that has touched it (not just one tenant). Each row includes
        the workshop name, date, mileage and totals.
        """
        vehicle = self.get_object()
        visits = _aggregate_visits_for_global_vehicle(str(vehicle.id))
        # `service_date` is a tz-aware datetime — serialise as ISO string so
        # DRF doesn't have to pull each tenant's settings to format it.
        for row in visits:
            row["service_date"] = row["service_date"].isoformat()
        return Response({"vehicle_id": str(vehicle.id), "visits": visits})

    @action(detail=True, methods=["get"], url_path="door-sticker")
    def door_sticker(self, request, pk=None):
        """
        Owner-facing door-jamb sticker PDF (40×100 mm vertical strip).

        Identical layout to the workshop-side sticker: QR for lookup, last/
        next service date+km, plate and VIN. No workshop branding. Last-service
        info is sourced from the aggregated cross-tenant history so the owner
        sees the most recent service regardless of which shop performed it.
        """
        from visits.report_labels import (
            VEHICLE_DOOR_STICKER,
            get_labels,
            normalize_language,
        )

        vehicle = self.get_object()

        # Owners don't have a tenant; default to Albanian which is the
        # primary market. Could be made configurable via a `?lang=` param.
        language = normalize_language(request.query_params.get("lang") or "sq")
        labels = get_labels(VEHICLE_DOOR_STICKER, language)

        history = _aggregate_visits_for_global_vehicle(str(vehicle.id))
        last = history[0] if history else None
        last_service_date = last["service_date"] if last else None
        last_service_km = last["mileage_km"] if last else None

        next_service_date = (
            last_service_date + timedelta(days=365) if last_service_date else None
        )
        next_service_km = (
            (last_service_km + 10_000) if last_service_km else None
        )

        qr = qr_code_response(payload=str(vehicle.id))
        html_content = render_to_string(
            "reports/vehicle_door_sticker.html",
            {
                "vehicle": vehicle,
                "qr_data_url": qr["qr_code"],
                "L": labels,
                "language": language,
                "last_service_date": last_service_date,
                "last_service_km": last_service_km,
                "next_service_date": next_service_date,
                "next_service_km": next_service_km,
            },
        )

        pdf = HTML(string=html_content, base_url=request.build_absolute_uri("/")).write_pdf()

        plate_slug = (vehicle.license_plate or "vehicle").replace(" ", "")
        filename = f"door-sticker-{plate_slug}.pdf"
        disposition = (request.query_params.get("disposition") or "attachment").lower()
        content_disposition = (
            f'inline; filename="{filename}"'
            if disposition == "inline"
            else f'attachment; filename="{filename}"'
        )

        response = HttpResponse(pdf, content_type="application/pdf")
        response["Content-Disposition"] = content_disposition
        response["Cache-Control"] = "no-store"
        return response

    @action(detail=True, methods=["get"], url_path="service-booklet")
    def service_booklet(self, request, pk=None):
        """
        Owner-facing service booklet PDF that aggregates the completed visits
        from every workshop that has serviced this vehicle. Each visit shows
        date, workshop name, mileage and totals.
        """
        vehicle = self.get_object()
        visits = _aggregate_visits_for_global_vehicle(str(vehicle.id))

        grand_total = sum(v["grand_total"] for v in visits)

        html_content = render_to_string(
            "reports/owner_service_history.html",
            {
                "vehicle": vehicle,
                "visits": visits,
                "visit_count": len(visits),
                "grand_total": grand_total,
                "generated_at": timezone.now(),
                "owner_name": getattr(
                    request.user.global_owner_profile, "name", ""
                ) or request.user.username,
            },
        )

        pdf = HTML(string=html_content, base_url=request.build_absolute_uri("/")).write_pdf()

        plate_slug = (vehicle.license_plate or "vehicle").replace(" ", "")
        filename = f"service-history-{plate_slug}.pdf"
        disposition = (request.query_params.get("disposition") or "attachment").lower()
        content_disposition = (
            f'inline; filename="{filename}"'
            if disposition == "inline"
            else f'attachment; filename="{filename}"'
        )

        response = HttpResponse(pdf, content_type="application/pdf")
        response["Content-Disposition"] = content_disposition
        response["Cache-Control"] = "no-store"
        return response


class OwnerClaimView(APIView):
    """Redeem a workshop-generated QR token to add a vehicle to owner inventory."""

    permission_classes = [IsOwnerUser]

    def post(self, request):
        serializer = ClaimVehicleSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        ownership = redeem_claim_token(
            token_id=serializer.validated_data["token"],
            user=request.user,
        )
        vehicle = ownership.vehicle
        return Response(
            {
                "ownership": VehicleOwnershipSerializer(ownership).data,
                "vehicle": GlobalVehicleSerializer(vehicle, context={"request": request}).data,
            },
            status=status.HTTP_201_CREATED,
        )


class OwnerClaimPreviewView(APIView):
    """Preview claim token details before redeeming (authenticated owner)."""

    permission_classes = [IsOwnerUser]

    def get(self, request):
        from .models import VehicleClaimToken
        from .serializers import VehicleClaimTokenSerializer

        raw = request.query_params.get("token", "")
        token_id = parse_claim_token_id(raw)
        if not token_id:
            return Response({"detail": "Token is required."}, status=400)

        try:
            token = VehicleClaimToken.objects.select_related(
                "vehicle",
                "from_owner",
            ).get(id=token_id)
        except VehicleClaimToken.DoesNotExist:
            return Response({"detail": "Invalid claim token."}, status=404)

        return Response({
            "token": VehicleClaimTokenSerializer(token).data,
            "vehicle": GlobalVehicleSerializer(token.vehicle, context={"request": request}).data,
            "is_valid": token.is_valid,
        })
