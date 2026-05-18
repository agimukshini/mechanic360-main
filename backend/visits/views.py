"""
API viewsets for service catalog, visit line items, and preventive maintenance.

These complete the "Services & Repairs Logging" and "Preventive Maintenance"
parts of the scope from a backend perspective.
"""
from __future__ import annotations

from rest_framework import viewsets, filters, status
from rest_framework.decorators import action
from rest_framework.response import Response

from vehicles.models import ServiceVisit
from .completion import apply_visit_completion_effects
from .models import (
    ServiceCatalogItem,
    VisitLaborLine,
    VisitMaterialLine,
    VisitServiceLine,
    PreventiveMaintenancePlan,
)
from mechanic360.mixins import AdvisorWriteMixin, DestroyRequiresAdvisorMixin
from mechanic360.permissions import IsTenantUser

from .serializers import (
    ServiceVisitSerializer,
    ServiceCatalogItemSerializer,
    VisitLaborLineSerializer,
    VisitMaterialLineSerializer,
    VisitServiceLineSerializer,
    PreventiveMaintenancePlanSerializer,
)


class ServiceVisitViewSet(DestroyRequiresAdvisorMixin, viewsets.ModelViewSet):
    """
    Full CRUD over service visits for the current tenant.

    Tenants can:
    - create new service visits for vehicles
    - update visit status and details
    - view visit history
    - close visits
    """

    queryset = (
        ServiceVisit.objects.select_related("vehicle", "client")
        .prefetch_related("service_lines", "material_lines", "labor_lines")
        .all()
    )
    serializer_class = ServiceVisitSerializer
    permission_classes = [IsTenantUser]

    filter_backends = [filters.SearchFilter, filters.OrderingFilter]
    search_fields = ["vehicle__license_plate", "vehicle__vin", "client__name", "status"]
    ordering_fields = ["service_date", "status", "created_at"]
    ordering = ["-service_date"]

    def get_queryset(self):
        """Filter visits by vehicle if vehicle_id param is provided."""
        queryset = super().get_queryset()
        vehicle_id = self.request.query_params.get("vehicle")
        if vehicle_id:
            queryset = queryset.filter(vehicle_id=vehicle_id)
        return queryset

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
        if visit.status != ServiceVisit.Status.IN_PROGRESS:
            return Response(
                {"error": f"Cannot complete visit in '{visit.status}' status. Must be in progress."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        visit.status = ServiceVisit.Status.COMPLETED
        visit.save(update_fields=["status", "updated_at"])
        apply_visit_completion_effects(visit)
        serializer = self.get_serializer(visit)
        return Response(serializer.data)

    @action(detail=True, methods=["post"], url_path="finish")
    def finish_visit(self, request, pk=None):
        """
        Save visit details and mark completed in one step (from draft or in_progress).
        """
        visit = self.get_object()
        mileage_km = request.data.get("mileage_km")
        notes = request.data.get("notes")

        if visit.status == ServiceVisit.Status.COMPLETED:
            if mileage_km is not None:
                visit.mileage_km = int(mileage_km)
            if notes is not None:
                visit.notes = notes
            update_fields = ["updated_at"]
            if mileage_km is not None:
                update_fields.append("mileage_km")
            if notes is not None:
                update_fields.append("notes")
            if len(update_fields) > 1:
                visit.save(update_fields=update_fields)
                apply_visit_completion_effects(visit)
            serializer = self.get_serializer(visit)
            return Response(
                {**serializer.data, "already_completed": True},
                status=status.HTTP_200_OK,
            )

        if visit.status == ServiceVisit.Status.CANCELLED:
            return Response(
                {"error": f"Cannot finish visit in '{visit.status}' status."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        if mileage_km is not None:
            visit.mileage_km = int(mileage_km)
        if notes is not None:
            visit.notes = notes

        visit.status = ServiceVisit.Status.COMPLETED
        visit.save(update_fields=["status", "mileage_km", "notes", "updated_at"])
        apply_visit_completion_effects(visit)
        serializer = self.get_serializer(visit)
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


class VisitServiceLineViewSet(viewsets.ModelViewSet):
    """
    CRUD for service line items on visits (what services were performed).
    """

    serializer_class = VisitServiceLineSerializer
    permission_classes = [IsTenantUser]

    def get_queryset(self):
        queryset = VisitServiceLine.objects.select_related("visit").all()
        visit_id = self.request.query_params.get("visit")
        if visit_id:
            queryset = queryset.filter(visit_id=visit_id)
        return queryset


class VisitMaterialLineViewSet(viewsets.ModelViewSet):
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


class VisitLaborLineViewSet(viewsets.ModelViewSet):
    """
    CRUD for labor lines on visits (labor description, hours, rate).
    """

    serializer_class = VisitLaborLineSerializer
    permission_classes = [IsTenantUser]

    def get_queryset(self):
        queryset = VisitLaborLine.objects.select_related("visit").all()
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


