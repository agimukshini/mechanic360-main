from __future__ import annotations

from rest_framework import filters, status, viewsets
from rest_framework.exceptions import NotFound, PermissionDenied, ValidationError
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from mechanic360.permissions import IsAdvisorOrAdmin, IsTenantUser

from .models import PreventiveMaintenanceOrder
from .pm_serializers import (
    PreventiveMaintenanceOrderSerializer,
    PreventiveMaintenanceOrderWriteSerializer,
)
from .pm_services import (
    filter_orders_for_tenant,
    get_tenant_global_vehicle_ids,
    get_tenant_offered_pm_kinds,
)


class PreventiveMaintenanceOrderViewSet(viewsets.ModelViewSet):
    """
    Cross-tenant PM work orders visible to workshops that have the vehicle
    AND offer the matching service type in their catalog.
    """

    permission_classes = [IsAuthenticated, IsTenantUser]
    filter_backends = [filters.OrderingFilter]
    ordering_fields = ["due_date", "created_at", "pm_kind"]
    ordering = ["due_date", "-created_at"]
    http_method_names = ["get", "post", "head", "options"]

    def get_serializer_class(self):
        if self.action in {"create", "partial_update", "update"}:
            return PreventiveMaintenanceOrderWriteSerializer
        return PreventiveMaintenanceOrderSerializer

    def get_permissions(self):
        if self.action in {"create", "partial_update", "update"}:
            return [IsAuthenticated(), IsAdvisorOrAdmin()]
        return super().get_permissions()

    def get_queryset(self):
        tenant = self.request.user.tenant
        qs = PreventiveMaintenanceOrder.objects.select_related("global_vehicle").all()
        qs = filter_orders_for_tenant(qs, tenant)

        status_param = self.request.query_params.get("status")
        if status_param:
            qs = qs.filter(status=status_param)
        else:
            qs = qs.filter(status=PreventiveMaintenanceOrder.Status.OPEN)

        pm_kind = self.request.query_params.get("pm_kind")
        if pm_kind:
            qs = qs.filter(pm_kind=pm_kind)

        global_vehicle = self.request.query_params.get("global_vehicle")
        if global_vehicle:
            qs = qs.filter(global_vehicle_id=global_vehicle)

        return qs

    def perform_create(self, serializer):
        tenant = self.request.user.tenant
        global_vehicle_id = serializer.validated_data.get("global_vehicle_id")
        local_vehicle_id = self.request.data.get("local_vehicle_id")

        if global_vehicle_id not in get_tenant_global_vehicle_ids(tenant):
            if local_vehicle_id:
                from vehicles.models import Vehicle

                try:
                    local = Vehicle.objects.get(pk=local_vehicle_id)
                except Vehicle.DoesNotExist as exc:
                    raise NotFound("Vehicle not found in your workshop.") from exc
                if local.global_vehicle_id != global_vehicle_id:
                    raise ValidationError({"global_vehicle_id": "Vehicle link mismatch."})
            else:
                raise PermissionDenied("This vehicle is not in your workshop registry.")

        serializer.save()

    def list(self, request, *args, **kwargs):
        offered = sorted(get_tenant_offered_pm_kinds(request.user.tenant))
        if not offered:
            return Response(
                {
                    "count": 0,
                    "results": [],
                    "offered_pm_kinds": [],
                    "detail": (
                        "No preventive maintenance types configured. "
                        "Set PM type on services in your catalog."
                    ),
                },
            )
        queryset = self.filter_queryset(self.get_queryset())
        serializer = self.get_serializer(queryset, many=True)
        return Response(
            {
                "count": len(serializer.data),
                "results": serializer.data,
                "offered_pm_kinds": offered,
            },
        )
