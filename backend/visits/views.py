"""
API viewsets for service catalog, visit line items, and preventive maintenance.

These complete the "Services & Repairs Logging" and "Preventive Maintenance"
parts of the scope from a backend perspective.
"""
from __future__ import annotations

from django.core.exceptions import ValidationError
from django.db.models import Q
from rest_framework import viewsets, filters, status
from rest_framework.decorators import action
from rest_framework.response import Response

from django.contrib.auth import get_user_model
from global_vehicles.models import GlobalVehicle
from tenancy.views import public_schema
from vehicles.models import ServiceVisit
from .services import complete_in_progress_visit, finish_service_visit
from .models import (
    ServiceCatalogItem,
    VisitLaborLine,
    VisitMaterialLine,
    VisitServiceLine,
    PreventiveMaintenancePlan,
)
from mechanic360.mixins import (
    AdvisorWriteMixin,
    AdvisorWriteTenantReadMixin,
    DestroyRequiresAdvisorMixin,
    MechanicOwnWorkLineMixin,
    MechanicReadOnlyMixin,
    VisitAdvisorActionsMixin,
)
from mechanic360.permissions import IsAdvisorOrAdmin, IsTenantUser

from .serializers import (
    ServiceVisitSerializer,
    ServiceCatalogItemSerializer,
    VisitLaborLineSerializer,
    VisitMaterialLineSerializer,
    VisitServiceLineSerializer,
    PreventiveMaintenancePlanSerializer,
)

User = get_user_model()


def _validation_error_response(exc: ValidationError) -> Response:
    message = exc.messages[0] if getattr(exc, "messages", None) else str(exc)
    return Response({"error": message}, status=status.HTTP_400_BAD_REQUEST)


class ServiceVisitViewSet(DestroyRequiresAdvisorMixin, VisitAdvisorActionsMixin, viewsets.ModelViewSet):
    """
    Full CRUD over service visits for the current tenant.

    Tenants can:
    - create new service visits for vehicles
    - update visit status and details
    - view visit history
    - close visits
    """

    queryset = (
        ServiceVisit.objects.select_related(
            "vehicle",
            "vehicle__assigned_mechanic",
            "client",
            "created_by",
        )
        .prefetch_related("service_lines", "material_lines", "labor_lines")
        .all()
    )
    serializer_class = ServiceVisitSerializer
    permission_classes = [IsTenantUser]

    filter_backends = [filters.SearchFilter, filters.OrderingFilter]
    # Substring matching (icontains) is the default for DRF SearchFilter, so
    # `?search=AB123` matches any visit whose vehicle plate, VIN, or owner
    # name contains "AB123".
    search_fields = [
        "vehicle__license_plate",
        "vehicle__vin",
        "vehicle__make",
        "vehicle__model",
        "client__name",
        "status",
    ]
    ordering_fields = ["service_date", "status", "created_at"]
    ordering = ["-service_date"]

    def get_queryset(self):
        """Filter visits by vehicle or mechanic when requested."""
        queryset = super().get_queryset()
        user = self.request.user
        if getattr(user, "role", None) == User.Role.MECHANIC:
            queryset = queryset.exclude(status=ServiceVisit.Status.CANCELLED)
        vehicle_id = self.request.query_params.get("vehicle")
        if vehicle_id:
            queryset = queryset.filter(vehicle_id=vehicle_id)
        mechanic_id = self.request.query_params.get("mechanic")
        if mechanic_id and getattr(user, "role", None) != User.Role.MECHANIC:
            queryset = queryset.filter(
                Q(service_lines__performed_by_id=mechanic_id)
                | Q(labor_lines__performed_by_id=mechanic_id)
                | Q(created_by_id=mechanic_id)
                | Q(inspection__performed_by_id=mechanic_id)
            ).distinct()
        return queryset

    def filter_queryset(self, queryset):
        """
        Run the standard DRF SearchFilter, then widen the result set to also
        include visits whose linked GlobalVehicle (public schema) matches the
        same VIN/plate/make/model substring. The local Vehicle.global_vehicle_id
        column is a UUID with no FK relation (cross-schema), so we resolve
        matching globals first and OR-in their IDs.
        """
        queryset = super().filter_queryset(queryset)
        search = self.request.query_params.get("search", "").strip()
        if not search:
            return queryset
        with public_schema():
            global_ids = list(
                GlobalVehicle.objects.filter(
                    Q(vin__icontains=search)
                    | Q(license_plate__icontains=search)
                    | Q(make__icontains=search)
                    | Q(model__icontains=search)
                ).values_list("id", flat=True)[:500]
            )
        if not global_ids:
            return queryset
        # Re-fetch the unfiltered base queryset so we can OR-in global hits
        # without losing the mechanic / vehicle / role scoping above.
        base = self.get_queryset()
        global_hits = base.filter(vehicle__global_vehicle_id__in=global_ids)
        return (queryset | global_hits).distinct()

    @action(detail=True, methods=["post"], url_path="start")
    def start_visit(self, request, pk=None):
        """
        Transition visit from draft to in_progress.
        """
        visit = self.get_object()
        if visit.status != ServiceVisit.Status.DRAFT:
            return Response(
                {"error": f"Cannot start visit in '{visit.status}' status. Must be draft."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        visit.status = ServiceVisit.Status.IN_PROGRESS
        visit.save(update_fields=["status", "updated_at"])
        serializer = self.get_serializer(visit)
        return Response(serializer.data)

    @action(detail=True, methods=["post"], url_path="complete")
    def complete_visit(self, request, pk=None):
        """
        Transition visit from in_progress to completed.
        """
        visit = self.get_object()
        try:
            visit = complete_in_progress_visit(visit)
        except ValidationError as exc:
            return _validation_error_response(exc)
        serializer = self.get_serializer(visit)
        return Response(serializer.data)

    @action(detail=True, methods=["post"], url_path="finish")
    def finish_visit(self, request, pk=None):
        """
        Save visit details and mark completed in one step (from draft or in_progress).
        """
        visit = self.get_object()
        was_completed = visit.status == ServiceVisit.Status.COMPLETED
        try:
            visit = finish_service_visit(
                visit,
                mileage_km=request.data.get("mileage_km"),
                hour_meter=request.data.get("hour_meter"),
                notes=request.data.get("notes"),
            )
        except ValidationError as exc:
            return _validation_error_response(exc)
        serializer = self.get_serializer(visit)
        if was_completed:
            return Response(
                {**serializer.data, "already_completed": True},
                status=status.HTTP_200_OK,
            )
        return Response(serializer.data)

    @action(detail=True, methods=["post"], url_path="cancel")
    def cancel_visit(self, request, pk=None):
        """
        Cancel a visit (from draft or in_progress).
        """
        visit = self.get_object()
        if visit.status not in [ServiceVisit.Status.DRAFT, ServiceVisit.Status.IN_PROGRESS]:
            return Response(
                {"error": f"Cannot cancel visit in '{visit.status}' status."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        visit.status = ServiceVisit.Status.CANCELLED
        visit.save(update_fields=["status", "updated_at"])
        serializer = self.get_serializer(visit)
        return Response(serializer.data)


class ServiceCatalogViewSet(AdvisorWriteMixin, viewsets.ModelViewSet):
    """
    Manage standard services a workshop offers (e.g. Oil change, Brake service).
    """

    queryset = ServiceCatalogItem.objects.all()
    serializer_class = ServiceCatalogItemSerializer
    permission_classes = [IsTenantUser]

    filter_backends = [filters.SearchFilter, filters.OrderingFilter]
    search_fields = ["name", "description"]
    ordering_fields = ["name", "created_at"]
    ordering = ["name"]


class VisitServiceLineViewSet(MechanicOwnWorkLineMixin, viewsets.ModelViewSet):
    """
    CRUD for service line items on visits (what services were performed).
    """

    serializer_class = VisitServiceLineSerializer
    permission_classes = [IsTenantUser]

    def get_queryset(self):
        queryset = VisitServiceLine.objects.select_related("visit", "performed_by").all()
        visit_id = self.request.query_params.get("visit")
        if visit_id:
            queryset = queryset.filter(visit_id=visit_id)
        return queryset


class VisitMaterialLineViewSet(AdvisorWriteTenantReadMixin, viewsets.ModelViewSet):
    """
    CRUD for material/part lines on visits (what parts were used).
    """

    serializer_class = VisitMaterialLineSerializer
    permission_classes = [IsTenantUser]

    def get_queryset(self):
        queryset = VisitMaterialLine.objects.select_related("visit", "inventory_item").all()
        visit_id = self.request.query_params.get("visit")
        if visit_id:
            queryset = queryset.filter(visit_id=visit_id)
        return queryset


class VisitLaborLineViewSet(MechanicOwnWorkLineMixin, viewsets.ModelViewSet):
    """
    CRUD for labor lines on visits (labor description, hours, rate).
    """

    serializer_class = VisitLaborLineSerializer
    permission_classes = [IsTenantUser]

    def get_queryset(self):
        queryset = VisitLaborLine.objects.select_related("visit", "performed_by").all()
        visit_id = self.request.query_params.get("visit")
        if visit_id:
            queryset = queryset.filter(visit_id=visit_id)
        return queryset


class PreventiveMaintenancePlanViewSet(AdvisorWriteMixin, viewsets.ModelViewSet):
    """
    CRUD for preventive maintenance plans per vehicle.
    """

    queryset = PreventiveMaintenancePlan.objects.select_related("vehicle").all()
    serializer_class = PreventiveMaintenancePlanSerializer
    permission_classes = [IsTenantUser]

    filter_backends = [filters.SearchFilter, filters.OrderingFilter]
    search_fields = ["name", "vehicle__license_plate", "vehicle__vin"]
    ordering_fields = ["name", "created_at"]
    ordering = ["name"]

    def get_queryset(self):
        queryset = super().get_queryset()
        vehicle_id = self.request.query_params.get("vehicle")
        if vehicle_id:
            queryset = queryset.filter(vehicle_id=vehicle_id)
        return queryset


