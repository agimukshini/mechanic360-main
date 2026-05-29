"""
Cross-tenant photo gallery API. Sits on GlobalVehicle so the same picture
of a car is visible at every workshop that opens the same VIN. Writes are
gated by tenant (mechanic / admin only) and ownership of the photo:
upload from any workshop, but only the uploader's tenant (or a superadmin)
may edit / delete what they posted, to keep one shop from quietly wiping
another shop's evidence.

Per `VEHICLE_SHARING_POLICY.md` §2.1, photos are operational data on the
global vehicle. Audit events are emitted for every mutation.
"""
from __future__ import annotations

from rest_framework import status, viewsets
from rest_framework.exceptions import PermissionDenied, ValidationError
from rest_framework.parsers import FormParser, MultiPartParser
from rest_framework.response import Response

from mechanic360.permissions import IsTenantUser

from .audit import log_vehicle_event
from .models import GlobalVehicle, GlobalVehiclePhoto, VehicleAuditEvent
from .photo_serializers import GlobalVehiclePhotoSerializer


def _resolve_uploader_tenant(user):
    """Best-effort resolution of the workshop tenant from an auth'd user."""
    return getattr(user, "tenant", None)


class GlobalVehiclePhotoViewSet(viewsets.ModelViewSet):
    """
    `/api/v1/global-vehicles/photos/?vehicle=<global_vehicle_id>`

    GET (list / retrieve)  — any tenant user, cross-workshop visibility.
    POST                   — any tenant user, attaches their tenant.
    PATCH / PUT / DELETE   — only by the tenant that uploaded the photo
                             (or a platform superadmin).
    """

    queryset = GlobalVehiclePhoto.objects.select_related(
        "vehicle", "uploaded_by", "uploaded_by_tenant",
    ).all()
    serializer_class = GlobalVehiclePhotoSerializer
    permission_classes = [IsTenantUser]
    parser_classes = [MultiPartParser, FormParser]

    def get_queryset(self):
        qs = super().get_queryset()
        vehicle_id = self.request.query_params.get("vehicle")
        if vehicle_id:
            qs = qs.filter(vehicle_id=vehicle_id)
        return qs

    def _resolve_global_vehicle(self) -> GlobalVehicle:
        vehicle_id = (
            self.request.data.get("vehicle_id")
            or self.request.data.get("vehicle")
            or self.request.data.get("global_vehicle_id")
        )
        if not vehicle_id:
            raise ValidationError({"vehicle_id": "Required."})
        try:
            return GlobalVehicle.objects.get(id=vehicle_id)
        except (GlobalVehicle.DoesNotExist, ValueError, TypeError):
            raise ValidationError({"vehicle_id": "Global vehicle not found."})

    def perform_create(self, serializer):
        global_vehicle = self._resolve_global_vehicle()
        instance = serializer.save(
            vehicle=global_vehicle,
            uploaded_by=self.request.user if self.request.user.is_authenticated else None,
            uploaded_by_tenant=_resolve_uploader_tenant(self.request.user),
        )
        log_vehicle_event(
            entity=VehicleAuditEvent.Entity.PHOTO,
            action=VehicleAuditEvent.Action.CREATED,
            vehicle=global_vehicle,
            request=self.request,
            target_id=str(instance.id),
            changes={
                "caption": {"before": None, "after": instance.caption},
                "sort_order": {"before": None, "after": instance.sort_order},
            },
        )

    def _ensure_can_modify(self, instance: GlobalVehiclePhoto) -> None:
        user = self.request.user
        if user.is_superuser:
            return
        uploader_tenant_id = instance.uploaded_by_tenant_id
        user_tenant_id = getattr(getattr(user, "tenant", None), "id", None)
        # If the historic upload pre-dates uploaded_by_tenant being captured
        # we treat it as editable by anyone (legacy data) rather than locking
        # everyone out.
        if uploader_tenant_id is None:
            return
        if user_tenant_id == uploader_tenant_id:
            return
        raise PermissionDenied(
            "Only the workshop that uploaded this photo can edit or remove it.",
        )

    def perform_update(self, serializer):
        self._ensure_can_modify(serializer.instance)
        before_caption = serializer.instance.caption
        before_sort = serializer.instance.sort_order
        instance = serializer.save()
        log_vehicle_event(
            entity=VehicleAuditEvent.Entity.PHOTO,
            action=VehicleAuditEvent.Action.UPDATED,
            vehicle=instance.vehicle,
            request=self.request,
            target_id=str(instance.id),
            changes={
                "caption": {"before": before_caption, "after": instance.caption},
                "sort_order": {"before": before_sort, "after": instance.sort_order},
            },
        )

    def perform_destroy(self, instance):
        self._ensure_can_modify(instance)
        global_vehicle = instance.vehicle
        target_id = str(instance.id)
        caption = instance.caption
        instance.delete()
        log_vehicle_event(
            entity=VehicleAuditEvent.Entity.PHOTO,
            action=VehicleAuditEvent.Action.DELETED,
            vehicle=global_vehicle,
            request=self.request,
            target_id=target_id,
            changes={"caption": {"before": caption, "after": None}},
        )
