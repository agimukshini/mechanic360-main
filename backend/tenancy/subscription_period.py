"""
Resolve the current subscription membership window for a tenant (superadmin UI).
"""
from __future__ import annotations

from decimal import Decimal

from django.utils import timezone

from global_vehicles.invoice_services import add_billing_period, subtract_billing_period
from global_vehicles.models import PlatformInvoice, TenantPlatformBilling
from global_vehicles.subscription_reminder_services import primary_open_invoice

from .models import WorkshopTenant


def _has_paid_subscription(billing: TenantPlatformBilling) -> bool:
    return (
        billing.subscription_period != TenantPlatformBilling.SubscriptionPeriod.NONE
        and billing.subscription_fee_amount > Decimal("0.00")
    )


def resolve_tenant_subscription_period(
    tenant: WorkshopTenant,
    billing: TenantPlatformBilling | None = None,
    *,
    as_of=None,
) -> dict:
    """
    Return the active subscription period bounds for display.

    - Open subscription invoice periods take precedence.
    - After at least one invoice, ``subscription_next_charge_at`` is the period end.
    - Before the first invoice, the window runs from ``subscription_next_charge_at``
      (or now) through one billing period.
    """
    as_of = as_of or timezone.now()
    empty = {
        "subscription_period_start": None,
        "subscription_period_end": None,
        "subscription_days_remaining": None,
    }

    if billing is None:
        try:
            billing = tenant.platform_billing
        except TenantPlatformBilling.DoesNotExist:
            return empty

    if not _has_paid_subscription(billing):
        return empty

    open_invoice = primary_open_invoice(tenant=tenant)
    if open_invoice and open_invoice.period_start and open_invoice.period_end:
        period_start = open_invoice.period_start
        period_end = open_invoice.period_end
    else:
        has_invoices = PlatformInvoice.objects.filter(
            tenant=tenant,
            kind=PlatformInvoice.Kind.SUBSCRIPTION,
        ).exists()
        anchor = billing.subscription_next_charge_at or as_of
        period = billing.subscription_period

        if not has_invoices:
            period_start = anchor
            period_end = add_billing_period(anchor, period)
        else:
            period_end = anchor
            period_start = subtract_billing_period(anchor, period)

    days_remaining = (period_end.date() - as_of.date()).days

    return {
        "subscription_period_start": period_start,
        "subscription_period_end": period_end,
        "subscription_days_remaining": days_remaining,
    }
