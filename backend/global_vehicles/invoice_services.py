"""
Platform subscription invoicing — issue, update, and scheduled billing.
"""
from __future__ import annotations

import calendar
import logging
from datetime import timedelta
from decimal import Decimal
from typing import Any

from django.core.exceptions import PermissionDenied
from django.db import transaction
from django.db.models import Q
from django.utils import timezone

from .audit import log_vehicle_event
from .issuer_services import issuer_snapshot_dict
from .models import PlatformInvoice, TenantPlatformBilling, TransferBilling, VehicleAuditEvent

logger = logging.getLogger(__name__)

DUE_DAYS = 14


def subtract_billing_period(end, period: str):
    """Move a datetime back by one subscription period (monthly or yearly)."""
    if period == TenantPlatformBilling.SubscriptionPeriod.MONTHLY:
        month = end.month - 1
        year = end.year
        if month < 1:
            month = 12
            year -= 1
        day = min(end.day, calendar.monthrange(year, month)[1])
        return end.replace(year=year, month=month, day=day)
    if period == TenantPlatformBilling.SubscriptionPeriod.YEARLY:
        year = end.year - 1
        day = min(end.day, calendar.monthrange(year, end.month)[1])
        return end.replace(year=year, day=day)
    raise ValueError(f"Unsupported subscription period: {period}")


def add_billing_period(start, period: str):
    """Advance a datetime by one subscription period (monthly or yearly)."""
    if period == TenantPlatformBilling.SubscriptionPeriod.MONTHLY:
        month = start.month + 1
        year = start.year
        if month > 12:
            month = 1
            year += 1
        day = min(start.day, calendar.monthrange(year, month)[1])
        return start.replace(year=year, month=month, day=day)
    if period == TenantPlatformBilling.SubscriptionPeriod.YEARLY:
        year = start.year + 1
        day = min(start.day, calendar.monthrange(year, start.month)[1])
        return start.replace(year=year, day=day)
    raise ValueError(f"Unsupported subscription period: {period}")


def next_invoice_number(*, as_of=None) -> str:
    as_of = as_of or timezone.now()
    prefix = f"INV-{as_of.year}-"
    last = (
        PlatformInvoice.objects.filter(invoice_number__startswith=prefix)
        .order_by("-invoice_number")
        .values_list("invoice_number", flat=True)
        .first()
    )
    seq = int(last.rsplit("-", 1)[-1]) + 1 if last else 1
    return f"{prefix}{seq:06d}"


def subscription_line_description(billing: TenantPlatformBilling, period_start, period_end) -> str:
    period_label = billing.get_subscription_period_display()
    start = period_start.date().isoformat()
    end = period_end.date().isoformat()
    return f"Mechanic360 subscription ({period_label}) — {start} to {end}"


@transaction.atomic
def issue_subscription_invoice(
    *,
    billing: TenantPlatformBilling,
    as_of=None,
    actor=None,
    request=None,
) -> PlatformInvoice | None:
    """
    Issue one subscription invoice for the current billing period.

    Advances `subscription_next_charge_at` to the next period end. Returns None
    when subscription billing is disabled or the fee is zero.
    """
    as_of = as_of or timezone.now()
    period = billing.subscription_period
    if period == TenantPlatformBilling.SubscriptionPeriod.NONE:
        return None
    if billing.subscription_fee_amount <= Decimal("0.00"):
        return None

    charge_at = billing.subscription_next_charge_at or as_of
    if charge_at > as_of:
        return None

    period_start = charge_at
    period_end = add_billing_period(period_start, period)

    invoice = PlatformInvoice.objects.create(
        invoice_number=next_invoice_number(as_of=as_of),
        tenant=billing.tenant,
        kind=PlatformInvoice.Kind.SUBSCRIPTION,
        amount=billing.subscription_fee_amount,
        currency=billing.subscription_fee_currency,
        payment_status=TransferBilling.PaymentStatus.UNPAID,
        period_start=period_start,
        period_end=period_end,
        due_at=charge_at + timedelta(days=DUE_DAYS),
        issued_at=as_of,
        line_items=[
            {
                "description": subscription_line_description(
                    billing, period_start, period_end,
                ),
                "amount": str(billing.subscription_fee_amount),
                "currency": billing.subscription_fee_currency,
            },
        ],
        snapshot={
            "kind": "subscription",
            "subscription_period": period,
            "subscription_fee_amount": str(billing.subscription_fee_amount),
            "subscription_fee_currency": billing.subscription_fee_currency,
            "tenant_id": str(billing.tenant_id),
            "tenant_name": billing.tenant.name,
            "captured_at": as_of.isoformat(),
            "issuer": issuer_snapshot_dict(),
        },
    )

    billing.subscription_next_charge_at = period_end
    billing.save(update_fields=["subscription_next_charge_at", "updated_at"])

    log_vehicle_event(
        entity=VehicleAuditEvent.Entity.BILLING,
        action=VehicleAuditEvent.Action.BILLING_CHANGED,
        vehicle=None,
        request=request,
        target_id=str(invoice.id),
        changes={
            "invoice_issued": {
                "invoice_number": invoice.invoice_number,
                "amount": str(invoice.amount),
                "currency": invoice.currency,
                "period_start": period_start.isoformat(),
                "period_end": period_end.isoformat(),
            },
        },
        note=f"Subscription invoice {invoice.invoice_number} for {billing.tenant.name}",
        explicit_tenant_schema=billing.tenant.schema_name,
        explicit_tenant_name=billing.tenant.name,
        actor_user=actor,
    )
    from .subscription_reminder_services import notify_invoice_issued

    notify_invoice_issued(invoice)
    return invoice


def process_due_subscription_invoices(*, as_of=None) -> list[PlatformInvoice]:
    """Issue subscription invoices for all tenants whose next charge is due."""
    as_of = as_of or timezone.now()
    billings = TenantPlatformBilling.objects.select_related("tenant").filter(
        subscription_period__in=[
            TenantPlatformBilling.SubscriptionPeriod.MONTHLY,
            TenantPlatformBilling.SubscriptionPeriod.YEARLY,
        ],
        subscription_fee_amount__gt=Decimal("0.00"),
    ).filter(
        Q(subscription_next_charge_at__isnull=True)
        | Q(subscription_next_charge_at__lte=as_of),
    )

    issued: list[PlatformInvoice] = []
    for billing in billings:
        try:
            invoice = issue_subscription_invoice(billing=billing, as_of=as_of)
            if invoice:
                issued.append(invoice)
        except Exception:
            logger.exception(
                "Failed to issue subscription invoice for tenant %s",
                billing.tenant_id,
            )
    return issued


@transaction.atomic
def update_platform_invoice(
    *,
    invoice: PlatformInvoice,
    superadmin,
    new_status: str | None = None,
    invoice_reference: str | None = None,
    notes: str | None = None,
    request=None,
) -> PlatformInvoice:
    if not superadmin.is_superuser:
        raise PermissionDenied("Platform superuser access required.")

    changes: dict[str, dict[str, Any]] = {}

    if new_status is not None and new_status != invoice.payment_status:
        changes["payment_status"] = {
            "before": invoice.payment_status,
            "after": new_status,
        }
        invoice.payment_status = new_status
        if new_status == TransferBilling.PaymentStatus.PAID:
            invoice.paid_at = timezone.now()
            invoice.captured_by = superadmin
        elif new_status in {
            TransferBilling.PaymentStatus.UNPAID,
            TransferBilling.PaymentStatus.PROCESSING,
        }:
            invoice.paid_at = None
            invoice.captured_by = None

    if invoice_reference is not None and invoice_reference != invoice.invoice_reference:
        changes["invoice_reference"] = {
            "before": invoice.invoice_reference,
            "after": invoice_reference,
        }
        invoice.invoice_reference = invoice_reference

    if notes is not None and notes != invoice.notes:
        changes["notes"] = {"before": invoice.notes, "after": notes}
        invoice.notes = notes

    if not changes:
        return invoice

    invoice.save()
    log_vehicle_event(
        entity=VehicleAuditEvent.Entity.BILLING,
        action=VehicleAuditEvent.Action.BILLING_CHANGED,
        vehicle=None,
        request=request,
        target_id=str(invoice.id),
        changes=changes,
        note=f"Platform invoice {invoice.invoice_number}",
        explicit_tenant_schema=invoice.tenant.schema_name,
        explicit_tenant_name=invoice.tenant.name,
    )
    if invoice.payment_status == TransferBilling.PaymentStatus.PAID:
        from .subscription_reminder_services import maybe_reactivate_tenant_after_payment

        maybe_reactivate_tenant_after_payment(invoice)
    return invoice
