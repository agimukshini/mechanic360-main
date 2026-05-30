"""
API viewsets for vehicle management.

Workshop vehicles are stored per-tenant for visits and local clients, but each
create/update syncs to the platform-wide global registry.
"""
from __future__ import annotations

from django.contrib.auth import get_user_model
from rest_framework import viewsets, filters, status
from rest_framework.decorators import action
from rest_framework.parsers import FormParser, MultiPartParser
from rest_framework.response import Response
from django.db.models import Q

from global_vehicles.audit import log_vehicle_event, vehicle_diff
from global_vehicles.models import GlobalVehicle, VehicleAuditEvent, VehicleClaimToken
from global_vehicles.serializers import (
    UpdateRegistrationSerializer,
    VehicleClaimTokenSerializer,
    qr_code_response,
)
from global_vehicles.services import (
    create_owner_claim_token,
    create_transfer_token,
    parse_claim_token_id,
    update_vehicle_registration,
)
from mechanic360.mixins import DestroyRequiresAdvisorMixin
from mechanic360.permissions import IsTenantUser
from tenancy.views import public_schema

from .global_sync import get_global_vehicle_or_sync, sync_vehicle_to_global
from .models import Vehicle, VehicleDocument, VehicleGalleryPhoto
from .photo_sync import delete_global_gallery_photo, sync_gallery_photo_to_global
from .serializers import (
    VehicleDocumentSerializer,
    VehicleGalleryPhotoSerializer,
    VehicleSerializer,
)

_AUDIT_FIELDS = (
    "license_plate",
    "make",
    "model",
    "year",
    "engine_type",
    "fuel_type",
    "odometer_km",
    "hour_meter",
    "description",
    "owner_id",
    "assigned_mechanic_id",
    "is_active",
)


def _vehicle_snapshot(vehicle: Vehicle) -> dict:
    snap: dict = {}
    for f in _AUDIT_FIELDS:
        snap[f] = getattr(vehicle, f, None)
        if snap[f] is not None:
            snap[f] = str(snap[f]) if hasattr(snap[f], "hex") else snap[f]
    return snap

User = get_user_model()


class VehicleViewSet(DestroyRequiresAdvisorMixin, viewsets.ModelViewSet):
    """
    Full CRUD over vehicles for the current tenant.

    Creates and updates are mirrored to the global vehicle registry automatically.
    """

    queryset = Vehicle.objects.select_related("owner", "assigned_mechanic").all()
    serializer_class = VehicleSerializer
    permission_classes = [IsTenantUser]

    filter_backends = [filters.SearchFilter, filters.OrderingFilter]
    search_fields = ["vin", "license_plate", "make", "model", "description", "owner__name"]
    ordering_fields = ["license_plate", "make", "model", "created_at"]
    ordering = ["license_plate"]

    def get_queryset(self):
        queryset = super().get_queryset()
        user = self.request.user
        owner_id = self.request.query_params.get("owner")
        if owner_id:
            queryset = queryset.filter(owner_id=owner_id)
        mechanic_id = self.request.query_params.get("assigned_mechanic")
        if mechanic_id and getattr(user, "role", None) != User.Role.MECHANIC:
            queryset = queryset.filter(assigned_mechanic_id=mechanic_id)
        if self.action == "list":
            active = self.request.query_params.get("active", "true")
            if active == "false":
                queryset = queryset.filter(is_active=False)
            elif active != "all":
                queryset = queryset.filter(is_active=True)
        return queryset

    def perform_create(self, serializer):
        instance = serializer.save()
        log_vehicle_event(
            entity=VehicleAuditEvent.Entity.VEHICLE,
            action=VehicleAuditEvent.Action.CREATED,
            vehicle=instance,
            request=self.request,
            target_id=str(instance.id),
            changes=vehicle_diff(None, _vehicle_snapshot(instance), fields=list(_AUDIT_FIELDS)),
        )

    def perform_update(self, serializer):
        before = _vehicle_snapshot(self.get_object())
        instance = serializer.save()
        after = _vehicle_snapshot(instance)
        diff = vehicle_diff(before, after, fields=list(_AUDIT_FIELDS))

        # Split archive/restore from generic updates for clarity in the log.
        if "is_active" in diff:
            archived = bool(before.get("is_active")) and not bool(after.get("is_active"))
            restored = not bool(before.get("is_active")) and bool(after.get("is_active"))
            if archived or restored:
                log_vehicle_event(
                    entity=VehicleAuditEvent.Entity.ARCHIVE,
                    action=(
                        VehicleAuditEvent.Action.ARCHIVED
                        if archived
                        else VehicleAuditEvent.Action.RESTORED
                    ),
                    vehicle=instance,
                    request=self.request,
                    target_id=str(instance.id),
                    changes={"is_active": diff["is_active"]},
                )
                diff.pop("is_active", None)

        # Mechanic assignment changes get their own entity so the admin can
        # filter for "who handed the car to whom" without scrolling generic
        # updates.
        if "assigned_mechanic_id" in diff:
            log_vehicle_event(
                entity=VehicleAuditEvent.Entity.ASSIGNMENT,
                action=VehicleAuditEvent.Action.UPDATED,
                vehicle=instance,
                request=self.request,
                target_id=str(instance.id),
                changes={"assigned_mechanic_id": diff["assigned_mechanic_id"]},
            )
            diff.pop("assigned_mechanic_id", None)

        if diff:
            log_vehicle_event(
                entity=VehicleAuditEvent.Entity.VEHICLE,
                action=VehicleAuditEvent.Action.UPDATED,
                vehicle=instance,
                request=self.request,
                target_id=str(instance.id),
                changes=diff,
            )

    def destroy(self, request, *args, **kwargs):
        vehicle = self.get_object()
        if vehicle.visits.exists():
            return Response(
                {
                    "detail": (
                        "This vehicle has service visits and cannot be deleted. "
                        "Archive it instead to hide it from active lists."
                    )
                },
                status=status.HTTP_400_BAD_REQUEST,
            )
        # Snapshot BEFORE the delete so the diff captures the final state.
        snapshot = _vehicle_snapshot(vehicle)
        target_id = str(vehicle.id)
        plate = vehicle.license_plate or ""
        response = super().destroy(request, *args, **kwargs)
        log_vehicle_event(
            entity=VehicleAuditEvent.Entity.VEHICLE,
            action=VehicleAuditEvent.Action.DELETED,
            vehicle=None,
            global_vehicle_id=getattr(vehicle, "global_vehicle_id", None),
            request=request,
            target_id=target_id,
            changes={k: {"before": v, "after": None} for k, v in snapshot.items() if v is not None},
            note=f"Deleted vehicle {plate}",
        )
        return response

    def _global_vehicle_for_action(self, vehicle: Vehicle) -> GlobalVehicle:
        return get_global_vehicle_or_sync(
            vehicle=vehicle,
            user=self.request.user,
            tenant=self.request.user.tenant,
        )

    @action(detail=False, methods=["get"])
    def lookup(self, request):
        code = request.query_params.get("code", "").strip()
        if not code:
            return Response({"error": "Code parameter is required"}, status=400)

        if code.startswith("m360:claim:"):
            token_id = parse_claim_token_id(code)
            with public_schema():
                try:
                    token = VehicleClaimToken.objects.select_related("vehicle").get(id=token_id)
                except VehicleClaimToken.DoesNotExist:
                    return Response({"detail": "Claim token not found."}, status=404)
                local = Vehicle.objects.filter(global_vehicle_id=token.vehicle_id).first()
            if local:
                return Response(self.get_serializer(local).data)
            return Response(
                {
                    "detail": "Vehicle linked to this QR is not registered at this workshop yet.",
                    "global_vehicle_id": str(token.vehicle_id),
                },
                status=404,
            )

        vehicle = None
        try:
            vehicle = self.queryset.get(
                Q(id=code) | Q(global_vehicle_id=code) | Q(license_plate__iexact=code) | Q(vin__iexact=code),
            )
        except Vehicle.DoesNotExist:
            vehicle = self.queryset.filter(
                Q(license_plate__icontains=code) | Q(vin__icontains=code),
            ).first()

        if vehicle:
            return Response(self.get_serializer(vehicle).data)

        with public_schema():
            global_vehicle = None
            try:
                global_vehicle = GlobalVehicle.objects.get(id=code)
            except (GlobalVehicle.DoesNotExist, ValueError):
                global_vehicle = GlobalVehicle.objects.filter(
                    Q(vin__iexact=code) | Q(license_plate__iexact=code),
                ).first()

        if global_vehicle:
            local = Vehicle.objects.filter(global_vehicle_id=global_vehicle.id).first()
            if local:
                return Response(self.get_serializer(local).data)
            return Response(
                {
                    "detail": "Vehicle found in global registry but not at this workshop.",
                    "global_vehicle_id": str(global_vehicle.id),
                    "vin": global_vehicle.vin,
                    "license_plate": global_vehicle.license_plate,
                    "make": global_vehicle.make,
                    "model": global_vehicle.model,
                    "year": global_vehicle.year,
                },
                status=404,
            )

        search_results = self.filter_queryset(
            self.queryset.filter(
                Q(license_plate__icontains=code)
                | Q(vin__icontains=code)
                | Q(owner__name__icontains=code),
            ),
        )
        if search_results.exists():
            serializer = self.get_serializer(search_results, many=True)
            return Response(serializer.data)

        return Response({"error": "Vehicle not found"}, status=404)

    @action(detail=False, methods=["post"], url_path="adopt-global")
    def adopt_global(self, request):
        """
        Associate an existing GlobalVehicle with the current workshop.

        The vehicle already exists in the platform-wide registry (some other
        workshop registered it first); this just creates the tenant-local
        Vehicle row that visits/inspections need as a FK target. Local fields
        are inherited from the global record. Idempotent: if a local row
        already references this global vehicle (or its VIN), that row is
        returned untouched.

        No registration fee is charged on adoption — the platform charge
        fires once per global vehicle, on first registration. No audit event
        is emitted: only edits to the local copy from this point forward
        write to the audit log.
        """
        global_id = request.data.get("global_vehicle_id")
        if not global_id:
            return Response(
                {"global_vehicle_id": "Required."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        with public_schema():
            try:
                global_vehicle = (
                    GlobalVehicle.objects
                    .prefetch_related("ownerships__owner")
                    .get(id=global_id)
                )
            except (GlobalVehicle.DoesNotExist, ValueError, TypeError):
                return Response(
                    {"global_vehicle_id": "Global vehicle not found."},
                    status=status.HTTP_404_NOT_FOUND,
                )
            current_owner = global_vehicle.current_owner
            snapshot = {
                "id": global_vehicle.id,
                "vin": global_vehicle.vin,
                "license_plate": global_vehicle.license_plate,
                "make": global_vehicle.make,
                "model": global_vehicle.model,
                "year": global_vehicle.year,
                "engine_type": global_vehicle.engine_type or "",
                "fuel_type": global_vehicle.fuel_type or "",
                "odometer_km": global_vehicle.odometer_km or 0,
                "hour_meter": global_vehicle.hour_meter or 0,
            }

        # Mirror the platform-wide owner (if any) into this workshop's CRM
        # so subsequent visits and the Clients page recognise the person.
        # Idempotent — the helper finds or creates by global_owner_id.
        from clients.services import ensure_client_for_global_owner
        client = ensure_client_for_global_owner(current_owner)

        existing = Vehicle.objects.filter(
            Q(global_vehicle_id=snapshot["id"]) | Q(vin__iexact=snapshot["vin"]),
        ).first()
        if existing is not None:
            update_fields: list[str] = []
            if existing.global_vehicle_id != snapshot["id"]:
                existing.global_vehicle_id = snapshot["id"]
                update_fields.append("global_vehicle_id")
            if client is not None and existing.owner_id != client.id:
                existing.owner = client
                update_fields.append("owner")
            if update_fields:
                existing.save(update_fields=update_fields)
            return Response(self.get_serializer(existing).data)

        vehicle = Vehicle.objects.create(
            global_vehicle_id=snapshot["id"],
            vin=snapshot["vin"],
            license_plate=snapshot["license_plate"],
            make=snapshot["make"],
            model=snapshot["model"],
            year=snapshot["year"],
            engine_type=snapshot["engine_type"],
            fuel_type=snapshot["fuel_type"],
            odometer_km=snapshot["odometer_km"] or None,
            hour_meter=snapshot["hour_meter"] or None,
            owner=client,
            assigned_mechanic=None,
            is_active=True,
        )
        return Response(
            self.get_serializer(vehicle).data,
            status=status.HTTP_201_CREATED,
        )

    @action(detail=True, methods=["post"])
    def owner_claim_qr(self, request, pk=None):
        vehicle = self.get_object()
        global_vehicle = self._global_vehicle_for_action(vehicle)
        token = create_owner_claim_token(
            vehicle=global_vehicle,
            created_by=request.user,
            tenant=request.user.tenant,
            notes=request.data.get("notes", ""),
        )
        return Response(
            qr_code_response(
                payload=token.qr_payload,
                extra={
                    "token_id": str(token.id),
                    "purpose": token.purpose,
                    "vehicle_id": str(vehicle.id),
                    "global_vehicle_id": str(global_vehicle.id),
                    "expires_at": token.expires_at.isoformat(),
                    "claim_url": f"/owner/claim?token={token.id}",
                },
            ),
        )

    @action(detail=True, methods=["post"])
    def transfer_qr(self, request, pk=None):
        vehicle = self.get_object()
        global_vehicle = self._global_vehicle_for_action(vehicle)
        token = create_transfer_token(
            vehicle=global_vehicle,
            created_by=request.user,
            tenant=request.user.tenant,
            documents_verified=bool(request.data.get("documents_verified")),
            new_license_plate=request.data.get("new_license_plate", ""),
            notes=request.data.get("notes", ""),
        )
        return Response(
            qr_code_response(
                payload=token.qr_payload,
                extra={
                    "token_id": str(token.id),
                    "purpose": token.purpose,
                    "vehicle_id": str(vehicle.id),
                    "global_vehicle_id": str(global_vehicle.id),
                    "new_license_plate": token.new_license_plate,
                    "expires_at": token.expires_at.isoformat(),
                    "claim_url": f"/owner/claim?token={token.id}",
                },
            ),
        )

    @action(detail=True, methods=["patch"])
    def registration(self, request, pk=None):
        vehicle = self.get_object()
        global_vehicle = self._global_vehicle_for_action(vehicle)
        serializer = UpdateRegistrationSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        plate = serializer.validated_data["license_plate"]
        update_vehicle_registration(vehicle=global_vehicle, license_plate=plate)
        vehicle.license_plate = plate
        vehicle.save(update_fields=["license_plate", "updated_at"])
        return Response(self.get_serializer(vehicle).data)

    @action(detail=True, methods=["get"])
    def qr_code(self, request, pk=None):
        """Workshop lookup QR (tenant vehicle ID). Owner claim uses owner_claim_qr."""
        vehicle = self.get_object()
        return Response(
            qr_code_response(
                payload=str(vehicle.id),
                extra={
                    "vehicle_id": str(vehicle.id),
                    "global_vehicle_id": str(vehicle.global_vehicle_id) if vehicle.global_vehicle_id else None,
                    "vin": vehicle.vin,
                    "license_plate": vehicle.license_plate,
                },
            ),
        )

    @action(detail=True, methods=["get"], url_path="door-sticker")
    def door_sticker(self, request, pk=None):
        """
        Vehicle door-jamb sticker PDF (40mm × 100mm vertical strip).

        Shows the permanent lookup QR, last-service date & odometer, and the
        projected next-service date / km — like an OEM oil-change reminder
        sticker. Intentionally contains NO workshop branding: the vehicle may
        visit other shops, and a printed sticker on someone's car must not
        advertise one workshop on another shop's customer's vehicle. Tenant
        language is still used to localise the field labels.

        Query params:
          disposition: "attachment" (default) | "inline"
        """
        from datetime import timedelta

        from django.http import HttpResponse
        from django.template.loader import render_to_string
        from weasyprint import HTML

        from global_vehicles.serializers import qr_code_response
        from visits.models import PreventiveMaintenancePlan
        from visits.report_labels import (
            VEHICLE_DOOR_STICKER,
            get_labels,
            normalize_language,
        )
        from vehicles.models import ServiceVisit

        vehicle = self.get_object()

        # Language follows the authenticated tenant's preference (labels only).
        tenant = getattr(request.user, "tenant", None) if request.user.is_authenticated else None
        language = normalize_language(getattr(tenant, "language", "sq") if tenant else "sq")
        labels = get_labels(VEHICLE_DOOR_STICKER, language)

        # --- Last service (most recent completed visit) --------------------
        last_visit = (
            ServiceVisit.objects.filter(
                vehicle=vehicle,
                status=ServiceVisit.Status.COMPLETED,
            )
            .order_by("-service_date", "-created_at")
            .first()
        )
        last_service_date = last_visit.service_date if last_visit else None
        last_service_km = last_visit.mileage_km if last_visit else None

        # --- Next service (use active maintenance plan, else fallback) -----
        # Prefer an explicit `PreventiveMaintenancePlan` (km / hours / days
        # intervals). When none exists, fall back to a sensible default of
        # +10 000 km and +12 months from the last service — common workshop
        # practice for road vehicles in our market.
        plan = (
            PreventiveMaintenancePlan.objects.filter(vehicle=vehicle, is_active=True)
            .order_by("created_at")
            .first()
        )
        next_service_date = None
        next_service_km = None

        if plan is not None:
            if plan.interval_km and plan.last_mileage_km:
                next_service_km = plan.last_mileage_km + plan.interval_km
            if plan.interval_days and plan.last_service_date:
                next_service_date = plan.last_service_date + timedelta(days=plan.interval_days)

        if next_service_km is None and last_service_km:
            next_service_km = last_service_km + 10_000
        if next_service_date is None and last_visit:
            next_service_date = last_visit.service_date + timedelta(days=365)

        # QR payload is the tenant vehicle id — `vehiclesApi.lookup` resolves
        # it. We only need the `data:image/png;base64,...` URL from this helper.
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


class VehicleDocumentViewSet(viewsets.ModelViewSet):
    """CRUD for vehicle documents (service records, receipts, photos)."""

    serializer_class = VehicleDocumentSerializer
    permission_classes = [IsTenantUser]

    def get_queryset(self):
        vehicle_id = self.request.query_params.get("vehicle")
        if vehicle_id:
            return VehicleDocument.objects.filter(vehicle_id=vehicle_id).select_related("vehicle")
        return VehicleDocument.objects.none()

    def perform_create(self, serializer):
        vehicle_id = self.request.data.get("vehicle_id")
        vehicle = Vehicle.objects.get(id=vehicle_id)
        serializer.save(vehicle=vehicle)


class VehicleGalleryPhotoViewSet(viewsets.ModelViewSet):
    """
    CRUD for the per-vehicle photo gallery.

    All writes go through `IsTenantUser` — only workshop staff (mechanic or
    admin, never owner accounts) may upload, edit, or delete photos. Every
    mutation writes a `VehicleAuditEvent` so the superadmin can see exactly
    who touched which car's gallery.
    """

    serializer_class = VehicleGalleryPhotoSerializer
    permission_classes = [IsTenantUser]
    parser_classes = [MultiPartParser, FormParser]

    def get_queryset(self):
        qs = VehicleGalleryPhoto.objects.select_related("vehicle", "uploaded_by")
        vehicle_id = self.request.query_params.get("vehicle")
        if vehicle_id:
            qs = qs.filter(vehicle_id=vehicle_id)
        return qs

    def perform_create(self, serializer):
        vehicle_id = self.request.data.get("vehicle_id") or self.request.data.get("vehicle")
        if not vehicle_id:
            from rest_framework.exceptions import ValidationError
            raise ValidationError({"vehicle_id": "Required."})
        vehicle = Vehicle.objects.get(id=vehicle_id)
        instance = serializer.save(vehicle=vehicle, uploaded_by=self.request.user)
        sync_gallery_photo_to_global(
            tenant_photo=instance,
            user=self.request.user,
            tenant=getattr(self.request.user, "tenant", None),
        )
        if not vehicle.photo:
            vehicle.photo.name = instance.image.name
            vehicle.save(update_fields=["photo"])
            sync_vehicle_to_global(
                vehicle=vehicle,
                user=self.request.user,
                tenant=getattr(self.request.user, "tenant", None),
            )
        log_vehicle_event(
            entity=VehicleAuditEvent.Entity.PHOTO,
            action=VehicleAuditEvent.Action.CREATED,
            vehicle=vehicle,
            request=self.request,
            target_id=str(instance.id),
            note=f"Uploaded photo (caption: {instance.caption or '—'})",
        )

    def perform_update(self, serializer):
        before = {
            "caption": self.get_object().caption,
            "sort_order": self.get_object().sort_order,
        }
        instance = serializer.save()
        sync_gallery_photo_to_global(
            tenant_photo=instance,
            user=self.request.user,
            tenant=getattr(self.request.user, "tenant", None),
        )
        after = {"caption": instance.caption, "sort_order": instance.sort_order}
        diff = vehicle_diff(before, after, fields=["caption", "sort_order"])
        if diff:
            log_vehicle_event(
                entity=VehicleAuditEvent.Entity.PHOTO,
                action=VehicleAuditEvent.Action.UPDATED,
                vehicle=instance.vehicle,
                request=self.request,
                target_id=str(instance.id),
                changes=diff,
            )

    def perform_destroy(self, instance):
        vehicle = instance.vehicle
        photo_id = str(instance.id)
        caption = instance.caption
        instance.delete()
        delete_global_gallery_photo(photo_id=photo_id)
        log_vehicle_event(
            entity=VehicleAuditEvent.Entity.PHOTO,
            action=VehicleAuditEvent.Action.DELETED,
            vehicle=vehicle,
            request=self.request,
            target_id=photo_id,
            note=f"Deleted photo (caption: {caption or '—'})",
        )
