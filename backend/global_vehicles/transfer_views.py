"""
HTTP endpoints for the ownership-transfer lifecycle.

Three role-scoped ViewSets share the same underlying model:

- `WorkshopTransferViewSet`        — workshop staff initiate + cancel
- `OwnerTransferViewSet`           — vehicle owner confirms via QR
- `AdminTransferViewSet`           — platform superadmin: list / dispute /
                                     reverse / waive billing
- `AdminVehicleAuditViewSet`       — superadmin-only audit log

Every state change writes a `VehicleAuditEvent` via the helper in
`transfer_services.py` so the audit log is the single source of truth for
investigations.
"""
from __future__ import annotations

from rest_framework import filters, mixins, status, viewsets
from rest_framework.decorators import action
from rest_framework.exceptions import NotFound
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from mechanic360.permissions import (
    IsOwnerUser,
    IsPlatformSuperuser,
    IsTenantUser,
)

from .models import (
    GlobalVehicle,
    OwnershipTransfer,
    TenantPlatformBilling,
    TransferBilling,
    VehicleAuditEvent,
    VehicleRegistrationCharge,
)
from .serializers import (
    DisputeOrReverseSerializer,
    OwnershipTransferSerializer,
    StartTransferSerializer,
    TenantOwnershipTransferSerializer,
    TenantPlatformBillingSerializer,
    UpdateBillingSerializer,
    VehicleAuditEventSerializer,
    VehicleRegistrationChargeSerializer,
    qr_code_response,
)
from .transfer_services import (
    cancel_transfer,
    confirm_transfer,
    dispute_transfer,
    initiate_transfer,
    reverse_transfer,
    update_billing,
    update_registration_charge,
    update_tenant_platform_billing,
)


# ---------------------------------------------------------------------------
# Workshop-side
# ---------------------------------------------------------------------------


class WorkshopTransferViewSet(
    mixins.ListModelMixin,
    mixins.RetrieveModelMixin,
    viewsets.GenericViewSet,
):
    """
    Workshop staff: list transfers initiated by their tenant, start new
    transfers, and cancel pending ones they initiated.
    """

    serializer_class = TenantOwnershipTransferSerializer
    permission_classes = [IsTenantUser]
    queryset = OwnershipTransfer.objects.select_related(
        "vehicle",
        "from_owner",
        "to_owner",
        "initiated_by_tenant",
        "initiated_by_user",
        "billing",
        "claim_token",
    ).all()

    def get_queryset(self):
        qs = super().get_queryset()
        tenant = getattr(self.request.user, "tenant", None)
        if tenant is None:
            return qs.none()
        qs = qs.filter(initiated_by_tenant=tenant)

        status_filter = self.request.query_params.get("status")
        if status_filter:
            qs = qs.filter(status=status_filter)

        vehicle_filter = self.request.query_params.get("vehicle")
        if vehicle_filter:
            qs = qs.filter(vehicle_id=vehicle_filter)

        return qs.order_by("-initiated_at")

    @action(detail=False, methods=["post"], url_path="start")
    def start(self, request):
        """
        Initiate an ownership transfer for a vehicle.

        Body:
          - vehicle_id (required) — GlobalVehicle UUID
          - documents_verified (bool, required true)
          - new_license_plate (required)
          - notes (optional)
        """
        vehicle_id = request.data.get("vehicle_id")
        if not vehicle_id:
            return Response(
                {"detail": "vehicle_id is required."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        try:
            vehicle = GlobalVehicle.objects.get(id=vehicle_id)
        except (GlobalVehicle.DoesNotExist, ValueError):
            raise NotFound("Vehicle not found.")

        serializer = StartTransferSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data

        transfer = initiate_transfer(
            vehicle=vehicle,
            initiator=request.user,
            tenant=request.user.tenant,
            documents_verified=data.get("documents_verified", False),
            new_license_plate=data["new_license_plate"],
            notes=data.get("notes", ""),
            request=request,
        )

        body = self.get_serializer(transfer).data
        body["qr"] = qr_code_response(
            payload=transfer.claim_token.qr_payload,
            extra={
                "transfer_id": str(transfer.id),
                "claim_url": f"/owner/claim?token={transfer.claim_token.id}",
                "expires_at": transfer.claim_token.expires_at.isoformat(),
            },
        )
        return Response(body, status=status.HTTP_201_CREATED)

    @action(detail=True, methods=["post"])
    def cancel(self, request, pk=None):
        transfer = self.get_object()
        cancel_transfer(transfer=transfer, user=request.user, request=request)
        transfer.refresh_from_db()
        return Response(self.get_serializer(transfer).data)


# ---------------------------------------------------------------------------
# Owner-side
# ---------------------------------------------------------------------------


class OwnerTransferViewSet(
    mixins.ListModelMixin,
    mixins.RetrieveModelMixin,
    viewsets.GenericViewSet,
):
    """
    Authenticated owner: list transfers awaiting their confirmation, plus
    their historical confirmed/cancelled ones; POST /confirm/ to redeem.
    """

    serializer_class = TenantOwnershipTransferSerializer
    permission_classes = [IsOwnerUser]
    queryset = OwnershipTransfer.objects.select_related(
        "vehicle",
        "from_owner",
        "to_owner",
        "initiated_by_tenant",
        "billing",
        "claim_token",
    ).all()

    def get_queryset(self):
        """
        Owner sees:
          - Anything they're the from/to owner of (history).
          - Plus a single pending transfer addressed via ?token=<id> on
            the QR confirmation page, even before they're recorded as
            the to_owner (they become that on confirm).
        """
        from django.db.models import Q

        qs = super().get_queryset()
        token = self.request.query_params.get("token")
        if token:
            return qs.filter(claim_token_id=token)

        owner = getattr(self.request.user, "global_owner_profile", None)
        if owner is None:
            return qs.none()
        return qs.filter(Q(from_owner=owner) | Q(to_owner=owner)).distinct()

    @action(detail=True, methods=["post"])
    def confirm(self, request, pk=None):
        transfer = self.get_object()
        confirm_transfer(transfer=transfer, user=request.user, request=request)
        transfer.refresh_from_db()
        return Response(self.get_serializer(transfer).data)


# ---------------------------------------------------------------------------
# Superadmin
# ---------------------------------------------------------------------------


class AdminTransferViewSet(
    mixins.ListModelMixin,
    mixins.RetrieveModelMixin,
    viewsets.GenericViewSet,
):
    serializer_class = OwnershipTransferSerializer
    permission_classes = [IsPlatformSuperuser]
    queryset = OwnershipTransfer.objects.select_related(
        "vehicle",
        "from_owner",
        "to_owner",
        "initiated_by_tenant",
        "initiated_by_user",
        "confirmed_by_user",
        "claim_token",
        "billing",
    ).all()

    filter_backends = [filters.OrderingFilter]
    ordering_fields = ["initiated_at", "confirmed_at", "status"]
    ordering = ["-initiated_at"]

    def get_queryset(self):
        from django.db.models import Q

        qs = super().get_queryset()
        params = self.request.query_params

        if status_ := params.get("status"):
            qs = qs.filter(status=status_)
        if tenant_schema := params.get("tenant_schema"):
            qs = qs.filter(initiated_by_tenant__schema_name=tenant_schema)
        if global_vehicle_id := params.get("global_vehicle_id"):
            qs = qs.filter(vehicle_id=global_vehicle_id)
        if owner_id := params.get("owner_id"):
            qs = qs.filter(Q(from_owner_id=owner_id) | Q(to_owner_id=owner_id))
        if payment_status := params.get("payment_status"):
            qs = qs.filter(billing__payment_status=payment_status)
        if date_from := params.get("date_from"):
            qs = qs.filter(initiated_at__gte=date_from)
        if date_to := params.get("date_to"):
            qs = qs.filter(initiated_at__lte=date_to)
        if params.get("disputed_only") == "true":
            qs = qs.filter(status=OwnershipTransfer.Status.DISPUTED)
        if search := params.get("search"):
            qs = qs.filter(
                Q(vehicle__vin__icontains=search)
                | Q(vehicle__license_plate__icontains=search)
                | Q(from_owner__name__icontains=search)
                | Q(to_owner__name__icontains=search)
                | Q(initiated_by_tenant__name__icontains=search),
            )
        return qs

    @action(detail=True, methods=["post"])
    def dispute(self, request, pk=None):
        serializer = DisputeOrReverseSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        transfer = self.get_object()
        dispute_transfer(
            transfer=transfer,
            superadmin=request.user,
            notes=serializer.validated_data["notes"],
            request=request,
        )
        transfer.refresh_from_db()
        return Response(self.get_serializer(transfer).data)

    @action(detail=True, methods=["post"])
    def reverse(self, request, pk=None):
        serializer = DisputeOrReverseSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        transfer = self.get_object()
        reverse_transfer(
            transfer=transfer,
            superadmin=request.user,
            notes=serializer.validated_data["notes"],
            request=request,
        )
        transfer.refresh_from_db()
        return Response(self.get_serializer(transfer).data)

    @action(detail=True, methods=["patch"], url_path="billing")
    def billing(self, request, pk=None):
        transfer = self.get_object()
        if not hasattr(transfer, "billing"):
            raise NotFound("Transfer has no billing row.")
        serializer = UpdateBillingSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        update_billing(
            billing=transfer.billing,
            superadmin=request.user,
            new_status=serializer.validated_data.get("payment_status"),
            invoice_reference=serializer.validated_data.get("invoice_reference"),
            request=request,
        )
        transfer.refresh_from_db()
        return Response(self.get_serializer(transfer).data)


class AdminTenantPlatformBillingViewSet(
    mixins.ListModelMixin,
    mixins.RetrieveModelMixin,
    mixins.UpdateModelMixin,
    viewsets.GenericViewSet,
):
    """
    Per-tenant platform-billing configuration — superadmin reads / patches.

    URL pattern: `/api/v1/tenants/platform-billing/<tenant_id>/`. The pk is
    the tenant id (the row is keyed by `tenant_id`), so a missing row is
    auto-created on first read.
    """

    serializer_class = TenantPlatformBillingSerializer
    permission_classes = [IsPlatformSuperuser]
    queryset = TenantPlatformBilling.objects.select_related(
        "tenant", "updated_by",
    ).all()
    lookup_field = "tenant_id"

    def get_object(self):
        tenant_id = self.kwargs.get(self.lookup_field)
        from tenancy.models import WorkshopTenant
        try:
            tenant = WorkshopTenant.objects.get(id=tenant_id)
        except WorkshopTenant.DoesNotExist:
            raise NotFound("Tenant not found.")
        billing = TenantPlatformBilling.for_tenant(tenant)
        return billing

    def partial_update(self, request, *args, **kwargs):
        billing = self.get_object()
        serializer = self.get_serializer(billing, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)

        update_tenant_platform_billing(
            billing=billing,
            superadmin=request.user,
            fields=serializer.validated_data,
            request=request,
        )
        return Response(self.get_serializer(billing).data)


class AdminRegistrationChargeViewSet(
    mixins.ListModelMixin,
    mixins.RetrieveModelMixin,
    viewsets.GenericViewSet,
):
    """Cross-tenant feed of per-vehicle registration charges."""

    serializer_class = VehicleRegistrationChargeSerializer
    permission_classes = [IsPlatformSuperuser]
    queryset = VehicleRegistrationCharge.objects.select_related(
        "vehicle", "tenant", "created_by",
    ).all()

    filter_backends = [filters.OrderingFilter]
    ordering_fields = ["created_at", "fee_amount", "payment_status"]
    ordering = ["-created_at"]

    def get_queryset(self):
        qs = super().get_queryset()
        params = self.request.query_params
        if tenant_id := params.get("tenant_id"):
            qs = qs.filter(tenant_id=tenant_id)
        if payment_status := params.get("payment_status"):
            qs = qs.filter(payment_status=payment_status)
        return qs

    @action(detail=True, methods=["patch"], url_path="billing")
    def billing(self, request, pk=None):
        charge = self.get_object()
        update_registration_charge(
            charge=charge,
            superadmin=request.user,
            new_status=request.data.get("payment_status"),
            invoice_reference=request.data.get("invoice_reference"),
            request=request,
        )
        charge.refresh_from_db()
        return Response(self.get_serializer(charge).data)


class AdminVehicleAuditViewSet(
    mixins.ListModelMixin,
    mixins.RetrieveModelMixin,
    viewsets.GenericViewSet,
):
    """Cross-tenant audit feed — superadmin only."""

    serializer_class = VehicleAuditEventSerializer
    permission_classes = [IsPlatformSuperuser]
    queryset = VehicleAuditEvent.objects.all()

    filter_backends = [filters.OrderingFilter]
    ordering_fields = ["occurred_at"]
    ordering = ["-occurred_at"]

    def get_queryset(self):
        from django.db.models import Q

        qs = super().get_queryset()
        params = self.request.query_params

        if tenant_schema := params.get("tenant_schema"):
            qs = qs.filter(tenant_schema=tenant_schema)
        if entity := params.get("entity"):
            qs = qs.filter(entity=entity)
        if action_ := params.get("action"):
            qs = qs.filter(action=action_)
        if actor := params.get("actor_user_id"):
            qs = qs.filter(actor_user_id=actor)
        if vehicle_tenant_id := params.get("vehicle_tenant_id"):
            qs = qs.filter(vehicle_tenant_id=vehicle_tenant_id)
        if global_vehicle_id := params.get("global_vehicle_id"):
            qs = qs.filter(global_vehicle_id=global_vehicle_id)
        if target_id := params.get("target_id"):
            qs = qs.filter(target_id=target_id)
        if date_from := params.get("date_from"):
            qs = qs.filter(occurred_at__gte=date_from)
        if date_to := params.get("date_to"):
            qs = qs.filter(occurred_at__lte=date_to)
        if search := params.get("search"):
            qs = qs.filter(
                Q(note__icontains=search)
                | Q(actor_username__icontains=search)
                | Q(tenant_name__icontains=search)
                | Q(tenant_schema__icontains=search),
            )
        return qs
