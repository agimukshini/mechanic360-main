"""
API for the platform-wide vehicle registry (public schema).

Workshop staff register vehicles and issue owner claim / transfer QR codes.
"""
from __future__ import annotations

from rest_framework import viewsets, filters, status
from rest_framework.decorators import action
from rest_framework.response import Response
from django.db.models import Q

from mechanic360.permissions import IsTenantUser

from .models import GlobalVehicle, VehicleClaimToken
from .serializers import (
    GlobalVehicleSerializer,
    UpdateRegistrationSerializer,
    VehicleClaimTokenSerializer,
    qr_code_response,
)
from .services import create_owner_claim_token, create_transfer_token, update_vehicle_registration


class GlobalVehicleViewSet(viewsets.ModelViewSet):
    """
    CRUD over the global vehicle registry (public schema).
    """

    queryset = GlobalVehicle.objects.select_related(
        "registered_by_tenant",
    ).prefetch_related(
        "ownerships__owner",
    ).all()
    serializer_class = GlobalVehicleSerializer
    permission_classes = [IsTenantUser]

    filter_backends = [filters.SearchFilter, filters.OrderingFilter]
    search_fields = ["vin", "license_plate", "make", "model"]
    ordering_fields = ["license_plate", "make", "model", "created_at", "odometer_km"]
    ordering = ["license_plate"]

    def get_queryset(self):
        queryset = super().get_queryset()
        if self.action == "list":
            active = self.request.query_params.get("active", "true")
            if active == "false":
                queryset = queryset.filter(is_active=False)
            elif active != "all":
                queryset = queryset.filter(is_active=True)
        return queryset

    def perform_create(self, serializer):
        user = self.request.user
        serializer.save(
            registered_by_tenant=getattr(user, "tenant", None),
            registered_by=user if user.is_authenticated else None,
        )

    def destroy(self, request, *args, **kwargs):
        vehicle = self.get_object()
        vehicle.is_active = False
        vehicle.save(update_fields=["is_active", "updated_at"])
        return Response(status=status.HTTP_204_NO_CONTENT)

    @action(detail=False, methods=["get"])
    def lookup(self, request):
        code = request.query_params.get("code", "").strip()
        if not code:
            return Response({"error": "Code parameter is required"}, status=400)

        if code.startswith("m360:claim:"):
            token_id = code.split(":", 2)[2]
            try:
                token = VehicleClaimToken.objects.select_related(
                    "vehicle__registered_by_tenant",
                ).prefetch_related("vehicle__ownerships__owner").get(id=token_id)
            except VehicleClaimToken.DoesNotExist:
                return Response({"detail": "Claim token not found."}, status=404)

            return Response({
                "type": "claim_token",
                "token": VehicleClaimTokenSerializer(token).data,
                "vehicle": GlobalVehicleSerializer(token.vehicle, context={"request": request}).data,
            })

        vehicle = None
        try:
            vehicle = self.queryset.get(id=code)
        except (GlobalVehicle.DoesNotExist, ValueError):
            pass

        if vehicle is None:
            try:
                vehicle = self.queryset.get(vin__iexact=code)
            except GlobalVehicle.DoesNotExist:
                vehicle = (
                    self.queryset.filter(
                        Q(license_plate__iexact=code)
                        | Q(ownerships__license_plate__iexact=code),
                    )
                    .distinct()
                    .first()
                )

        if vehicle is None:
            vehicle = (
                self.queryset.filter(
                    Q(license_plate__icontains=code)
                    | Q(vin__icontains=code)
                    | Q(ownerships__license_plate__icontains=code),
                )
                .distinct()
                .first()
            )

        if vehicle:
            return Response({
                "type": "vehicle",
                "vehicle": self.get_serializer(vehicle).data,
            })

        return Response({"detail": "No matching global vehicle found."}, status=404)

    @action(detail=True, methods=["post"])
    def owner_claim_qr(self, request, pk=None):
        """Generate a QR code for the vehicle owner to add this vehicle to their app."""
        vehicle = self.get_object()
        notes = request.data.get("notes", "")
        token = create_owner_claim_token(
            vehicle=vehicle,
            created_by=request.user,
            tenant=request.user.tenant,
            notes=notes,
        )
        payload = token.qr_payload
        return Response(
            qr_code_response(
                payload=payload,
                extra={
                    "token_id": str(token.id),
                    "purpose": token.purpose,
                    "vehicle_id": str(vehicle.id),
                    "expires_at": token.expires_at.isoformat(),
                    "claim_url": f"/owner/claim?token={token.id}",
                },
            ),
        )

    @action(detail=True, methods=["post"])
    def transfer_qr(self, request, pk=None):
        """
        After document verification, generate a QR for the new owner to accept transfer.
        """
        vehicle = self.get_object()
        documents_verified = bool(request.data.get("documents_verified"))
        new_license_plate = request.data.get("new_license_plate", "")
        notes = request.data.get("notes", "")
        token = create_transfer_token(
            vehicle=vehicle,
            created_by=request.user,
            tenant=request.user.tenant,
            documents_verified=documents_verified,
            new_license_plate=new_license_plate,
            notes=notes,
        )
        payload = token.qr_payload
        return Response(
            qr_code_response(
                payload=payload,
                extra={
                    "token_id": str(token.id),
                    "purpose": token.purpose,
                    "vehicle_id": str(vehicle.id),
                    "new_license_plate": token.new_license_plate,
                    "expires_at": token.expires_at.isoformat(),
                    "claim_url": f"/owner/claim?token={token.id}",
                },
            ),
        )

    @action(detail=True, methods=["patch"])
    def registration(self, request, pk=None):
        """
        Update the current registration plate (e.g. re-registration without ownership change).
        """
        vehicle = self.get_object()
        serializer = UpdateRegistrationSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        update_vehicle_registration(
            vehicle=vehicle,
            license_plate=serializer.validated_data["license_plate"],
        )
        vehicle.refresh_from_db()
        return Response(self.get_serializer(vehicle).data)

    @action(detail=True, methods=["get"])
    def qr_code(self, request, pk=None):
        """Lookup QR (vehicle ID) for workshop scanning — not for owner claim."""
        vehicle = self.get_object()
        return Response(
            qr_code_response(
                payload=str(vehicle.id),
                extra={
                    "vehicle_id": str(vehicle.id),
                    "vin": vehicle.vin,
                    "license_plate": vehicle.license_plate,
                },
            ),
        )
