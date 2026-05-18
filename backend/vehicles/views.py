"""
API viewsets for vehicle management.

Tenants have full rights over their own registered vehicles.
Because we use schema-based multi-tenancy, each request is already scoped to
the current tenant's PostgreSQL schema; we simply require authentication here.

Note: ClientViewSet has been moved to clients.views.
"""
from __future__ import annotations

import io
import base64

import qrcode
from rest_framework import viewsets, filters, status
from rest_framework.decorators import action
from rest_framework.response import Response
from django.db.models import Q

from mechanic360.mixins import DestroyRequiresAdvisorMixin
from mechanic360.permissions import IsTenantUser

from .models import Vehicle, VehicleDocument
from .serializers import VehicleSerializer, VehicleDocumentSerializer


class VehicleViewSet(DestroyRequiresAdvisorMixin, viewsets.ModelViewSet):
    """
    Full CRUD over vehicles for the current tenant.

    Tenants can:
    - register new vehicles
    - link them to clients (owners)
    - update vehicle details
    - delete vehicles if needed
    """

    queryset = Vehicle.objects.select_related("owner").all()
    serializer_class = VehicleSerializer
    permission_classes = [IsTenantUser]

    filter_backends = [filters.SearchFilter, filters.OrderingFilter]
    search_fields = ["vin", "license_plate", "make", "model", "owner__name"]
    ordering_fields = ["license_plate", "make", "model", "created_at"]
    ordering = ["license_plate"]

    def get_queryset(self):
        """Filter by owner; active/archived only applies to list (not retrieve/edit)."""
        queryset = super().get_queryset()
        owner_id = self.request.query_params.get("owner")
        if owner_id:
            queryset = queryset.filter(owner_id=owner_id)
        # Archived vehicles must remain openable by ID — filter only on list.
        if self.action == "list":
            active = self.request.query_params.get("active", "true")
            if active == "false":
                queryset = queryset.filter(is_active=False)
            elif active != "all":
                queryset = queryset.filter(is_active=True)
        return queryset

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
        return super().destroy(request, *args, **kwargs)

    @action(detail=False, methods=["get"])
    def lookup(self, request):
        """
        Look up a vehicle by QR code data.
        
        Accepts a 'code' parameter and searches by:
        - Exact ID match
        - License plate
        - VIN
        
        Returns the matching vehicle or a list of potential matches.
        """
        code = request.query_params.get("code", "").strip()
        
        if not code:
            return Response(
                {"error": "Code parameter is required"},
                status=400
            )
        
        # Try exact matches first (ID, license plate, or VIN)
        vehicle = None
        try:
            vehicle = self.queryset.get(
                Q(id=code) | 
                Q(license_plate__iexact=code) | 
                Q(vin__iexact=code)
            )
        except Vehicle.DoesNotExist:
            # Try partial match on license plate or VIN
            vehicle = self.queryset.filter(
                Q(license_plate__icontains=code) |
                Q(vin__icontains=code)
            ).first()
        
        if vehicle:
            serializer = self.get_serializer(vehicle)
            return Response(serializer.data)
        
        # If no exact match, try search filter
        search_results = self.filter_queryset(
            self.queryset.filter(
                Q(license_plate__icontains=code) |
                Q(vin__icontains=code) |
                Q(owner__name__icontains=code)
            )
        )
        
        if search_results.exists():
            serializer = self.get_serializer(search_results, many=True)
            return Response(serializer.data)
        
        return Response(
            {"error": "Vehicle not found"},
            status=404
        )

    @action(detail=True, methods=["get"])
    def qr_code(self, request, pk=None):
        """
        Generate a QR code for the vehicle.

        The QR code contains the vehicle ID which can be used to look up
        the vehicle via the lookup endpoint.

        Returns the QR code as a base64-encoded PNG image.
        """
        vehicle = self.get_object()

        # Generate QR code data - encode the vehicle ID
        qr_data = str(vehicle.id)

        # Create QR code
        qr = qrcode.QRCode(
            version=1,
            error_correction=qrcode.constants.ERROR_CORRECT_L,
            box_size=10,
            border=4,
        )
        qr.add_data(qr_data)
        qr.make(fit=True)

        # Create image
        img = qr.make_image(fill_color="black", back_color="white")

        # Save to bytes buffer
        buffer = io.BytesIO()
        img.save(buffer, format="PNG")
        buffer.seek(0)

        # Convert to base64
        img_base64 = base64.b64encode(buffer.getvalue()).decode()

        return Response({
            "qr_code": f"data:image/png;base64,{img_base64}",
            "vehicle_id": str(vehicle.id),
            "vin": vehicle.vin,
            "license_plate": vehicle.license_plate,
        })


class VehicleDocumentViewSet(viewsets.ModelViewSet):
    """
    CRUD for vehicle documents (service records, receipts, photos).
    """

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


