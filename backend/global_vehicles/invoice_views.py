"""
HTTP endpoints for platform subscription invoices.
"""
from __future__ import annotations

from rest_framework import filters, mixins, status, viewsets
from rest_framework.decorators import action
from rest_framework.exceptions import NotFound
from rest_framework.response import Response
from rest_framework.views import APIView

from mechanic360.permissions import IsPlatformSuperuser, IsTenantAdmin, IsTenantUser

from tenancy.models import WorkshopTenant

from .invoice_pdf import render_platform_invoice_pdf
from .invoice_services import issue_subscription_invoice, update_platform_invoice
from .models import PlatformInvoice, TenantPlatformBilling
from .subscription_reminder_services import build_billing_status
from .serializers import PlatformInvoiceSerializer, UpdatePlatformInvoiceSerializer


class AdminPlatformInvoiceViewSet(
    mixins.ListModelMixin,
    mixins.RetrieveModelMixin,
    viewsets.GenericViewSet,
):
    """Superadmin: list invoices, update payment status, download PDF."""

    serializer_class = PlatformInvoiceSerializer
    permission_classes = [IsPlatformSuperuser]
    queryset = PlatformInvoice.objects.select_related(
        "tenant", "captured_by",
    ).all()

    filter_backends = [filters.OrderingFilter]
    ordering_fields = ["issued_at", "due_at", "amount", "payment_status"]
    ordering = ["-issued_at"]

    def get_queryset(self):
        qs = super().get_queryset()
        params = self.request.query_params
        if tenant_id := params.get("tenant_id"):
            qs = qs.filter(tenant_id=tenant_id)
        if payment_status := params.get("payment_status"):
            qs = qs.filter(payment_status=payment_status)
        if kind := params.get("kind"):
            qs = qs.filter(kind=kind)
        return qs

    @action(detail=True, methods=["patch"], url_path="payment")
    def payment(self, request, pk=None):
        invoice = self.get_object()
        serializer = UpdatePlatformInvoiceSerializer(data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        update_platform_invoice(
            invoice=invoice,
            superadmin=request.user,
            new_status=serializer.validated_data.get("payment_status"),
            invoice_reference=serializer.validated_data.get("invoice_reference"),
            notes=serializer.validated_data.get("notes"),
            request=request,
        )
        invoice.refresh_from_db()
        return Response(self.get_serializer(invoice).data)

    @action(detail=True, methods=["get"], url_path="pdf")
    def pdf(self, request, pk=None):
        invoice = self.get_object()
        return render_platform_invoice_pdf(invoice)


class WorkshopPlatformInvoiceViewSet(
    mixins.ListModelMixin,
    mixins.RetrieveModelMixin,
    viewsets.GenericViewSet,
):
    """Workshop admin: read-only list of their platform invoices + PDF."""

    serializer_class = PlatformInvoiceSerializer
    permission_classes = [IsTenantAdmin]
    queryset = PlatformInvoice.objects.select_related("tenant").all()
    ordering = ["-issued_at"]

    def get_queryset(self):
        tenant = getattr(self.request.user, "tenant", None)
        if tenant is None:
            return PlatformInvoice.objects.none()
        return super().get_queryset().filter(tenant_id=tenant.id)

    @action(detail=True, methods=["get"], url_path="pdf")
    def pdf(self, request, pk=None):
        invoice = self.get_object()
        return render_platform_invoice_pdf(invoice)


class WorkshopPlatformBillingStatusView(APIView):
    """Workshop staff: billing alert payload for dashboard banner."""

    permission_classes = [IsTenantUser]

    def get(self, request):
        tenant = request.user.tenant
        if tenant is None:
            return Response({"alert_level": "none", "message_key": "none"})
        return Response(build_billing_status(tenant=tenant))


class IssueSubscriptionInvoiceView(APIView):
    """Superadmin: manually issue the next subscription invoice for one tenant."""

    permission_classes = [IsPlatformSuperuser]

    def post(self, request, tenant_id):
        try:
            tenant = WorkshopTenant.objects.get(id=tenant_id)
        except WorkshopTenant.DoesNotExist:
            raise NotFound("Tenant not found.")

        billing = TenantPlatformBilling.for_tenant(tenant)
        invoice = issue_subscription_invoice(
            billing=billing,
            actor=request.user,
            request=request,
        )
        if invoice is None:
            return Response(
                {"detail": "No subscription invoice due — check period and fee."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        return Response(
            PlatformInvoiceSerializer(invoice).data,
            status=status.HTTP_201_CREATED,
        )
