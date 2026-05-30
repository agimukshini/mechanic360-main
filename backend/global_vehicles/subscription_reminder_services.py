"""
Subscription billing reminders, status for UI banners, and overdue suspension.
"""
from __future__ import annotations

import logging
from datetime import date
from typing import Any

from django.conf import settings
from django.contrib.auth import get_user_model
from django.core.mail import send_mail
from django.db import transaction
from django.utils import timezone

from accounts.notifications import Notification
from tenancy.models import WorkshopTenant

from .audit import log_vehicle_event
from .models import (
    PlatformInvoice,
    PlatformInvoiceReminder,
    TransferBilling,
    VehicleAuditEvent,
)

logger = logging.getLogger(__name__)

User = get_user_model()

OPEN_STATUSES = {
    TransferBilling.PaymentStatus.UNPAID,
    TransferBilling.PaymentStatus.PROCESSING,
}


def _reminder_days_before_due() -> tuple[int, ...]:
    return tuple(getattr(settings, "PLATFORM_BILLING_REMINDER_DAYS_BEFORE_DUE", (7, 1)))


def _reminder_days_before_period_end() -> tuple[int, ...]:
    return tuple(
        getattr(settings, "PLATFORM_BILLING_REMINDER_DAYS_BEFORE_PERIOD_END", (7, 1)),
    )


def grace_days_after_due() -> int:
    return int(getattr(settings, "PLATFORM_BILLING_GRACE_DAYS_AFTER_DUE", 14))


def _days_until(target: date | None, *, as_of: date) -> int | None:
    if target is None:
        return None
    return (target - as_of).days


def _days_overdue(due: date | None, *, as_of: date) -> int:
    if due is None:
        return 0
    return max(0, (as_of - due).days)


def open_subscription_invoices(*, tenant=None):
    qs = PlatformInvoice.objects.filter(
        kind=PlatformInvoice.Kind.SUBSCRIPTION,
        payment_status__in=OPEN_STATUSES,
    ).select_related("tenant")
    if tenant is not None:
        qs = qs.filter(tenant=tenant)
    return qs.order_by("due_at", "-issued_at")


def primary_open_invoice(*, tenant) -> PlatformInvoice | None:
    return open_subscription_invoices(tenant=tenant).first()


def tenant_has_open_subscription_debt(*, tenant, exclude: PlatformInvoice | None = None) -> bool:
    qs = open_subscription_invoices(tenant=tenant)
    if exclude is not None:
        qs = qs.exclude(pk=exclude.pk)
    return qs.exists()


def _reminder_kind_for_due(days: int) -> str | None:
    if days == 7:
        return PlatformInvoiceReminder.Kind.DUE_7D
    if days == 1:
        return PlatformInvoiceReminder.Kind.DUE_1D
    return None


def _reminder_kind_for_period_end(days: int) -> str | None:
    if days == 7:
        return PlatformInvoiceReminder.Kind.PERIOD_END_7D
    if days == 1:
        return PlatformInvoiceReminder.Kind.PERIOD_END_1D
    return None


def _tenant_admin_users(tenant: WorkshopTenant):
    return User.objects.filter(
        tenant=tenant,
        role=User.Role.ADMIN,
        is_active=True,
    )


def _email_recipients(tenant: WorkshopTenant) -> list[str]:
    emails: list[str] = []
    if tenant.contact_email:
        emails.append(tenant.contact_email.strip())
    for user in _tenant_admin_users(tenant):
        if user.email and user.email not in emails:
            emails.append(user.email)
    return emails


def _record_reminder(invoice: PlatformInvoice, kind: str) -> bool:
    _, created = PlatformInvoiceReminder.objects.get_or_create(
        invoice=invoice,
        kind=kind,
    )
    return created


def notify_tenant_admins(
    *,
    tenant: WorkshopTenant,
    title: str,
    message: str,
    notif_type: str = Notification.Type.WARNING,
    link: str = "/settings",
) -> None:
    for user in _tenant_admin_users(tenant):
        Notification.objects.create(
            user=user,
            title=title,
            message=message,
            type=notif_type,
            link=link,
        )


def email_tenant_admins(
    *,
    tenant: WorkshopTenant,
    subject: str,
    body: str,
) -> None:
    recipients = _email_recipients(tenant)
    if not recipients:
        return
    try:
        send_mail(
            subject=subject,
            message=body,
            from_email=settings.DEFAULT_FROM_EMAIL,
            recipient_list=recipients,
            fail_silently=True,
        )
    except Exception:
        logger.exception("Failed to email tenant %s billing reminder", tenant.id)


def notify_invoice_issued(invoice: PlatformInvoice) -> None:
    if not _record_reminder(invoice, PlatformInvoiceReminder.Kind.INVOICE_ISSUED):
        return
    tenant = invoice.tenant
    due = invoice.due_at.date().isoformat() if invoice.due_at else "—"
    title = f"New platform invoice {invoice.invoice_number}"
    message = (
        f"A subscription invoice for {invoice.amount} {invoice.currency} was issued. "
        f"Payment is due by {due}. View invoices in Settings."
    )
    notify_tenant_admins(
        tenant=tenant,
        title=title,
        message=message,
        notif_type=Notification.Type.INFO,
        link="/settings",
    )
    email_tenant_admins(
        tenant=tenant,
        subject=title,
        body=(
            f"Dear {tenant.name},\n\n"
            f"{message}\n\n"
            "Sign in to Mechanic360 → Settings to review and download the PDF.\n\n"
            "Mechanic360 Platform"
        ),
    )


def _send_reminder(
    *,
    invoice: PlatformInvoice,
    kind: str,
    title: str,
    message: str,
    notif_type: str = Notification.Type.WARNING,
) -> bool:
    if not _record_reminder(invoice, kind):
        return False
    notify_tenant_admins(
        tenant=invoice.tenant,
        title=title,
        message=message,
        notif_type=notif_type,
        link="/settings",
    )
    email_tenant_admins(
        tenant=invoice.tenant,
        subject=title,
        body=f"Dear {invoice.tenant.name},\n\n{message}\n\nMechanic360 Platform",
    )
    return True


def build_billing_status(*, tenant: WorkshopTenant, as_of=None) -> dict[str, Any]:
    as_of = (as_of or timezone.now()).date()
    invoice = primary_open_invoice(tenant=tenant)
    grace = grace_days_after_due()

    if invoice is None:
        return {
            "alert_level": "none",
            "message_key": "none",
            "tenant_active": tenant.is_active,
            "invoice": None,
            "days_until_due": None,
            "days_until_period_end": None,
            "days_overdue": 0,
            "grace_days_after_due": grace,
        }

    due_date = invoice.due_at.date() if invoice.due_at else None
    period_end_date = invoice.period_end.date() if invoice.period_end else None
    days_until_due = _days_until(due_date, as_of=as_of)
    days_until_period_end = _days_until(period_end_date, as_of=as_of)
    days_overdue = _days_overdue(due_date, as_of=as_of)

    alert_level = "info"
    message_key = "unpaid"

    if not tenant.is_active:
        alert_level = "suspended"
        message_key = "suspended"
    elif days_overdue >= grace:
        alert_level = "critical"
        message_key = "grace_exceeded"
    elif days_overdue > 0:
        alert_level = "critical"
        message_key = "overdue"
    elif days_until_due is not None and days_until_due <= 1:
        alert_level = "critical"
        message_key = "due_soon"
    elif days_until_period_end is not None and days_until_period_end <= 1:
        alert_level = "critical"
        message_key = "period_ending"
    elif days_until_due is not None and days_until_due <= 7:
        alert_level = "warning"
        message_key = "due_warning"
    elif days_until_period_end is not None and days_until_period_end <= 7:
        alert_level = "warning"
        message_key = "period_warning"

    return {
        "alert_level": alert_level,
        "message_key": message_key,
        "tenant_active": tenant.is_active,
        "invoice": {
            "id": str(invoice.id),
            "invoice_number": invoice.invoice_number,
            "amount": str(invoice.amount),
            "currency": invoice.currency,
            "payment_status": invoice.payment_status,
            "due_at": invoice.due_at.isoformat() if invoice.due_at else None,
            "period_end": invoice.period_end.isoformat() if invoice.period_end else None,
        },
        "days_until_due": days_until_due,
        "days_until_period_end": days_until_period_end,
        "days_overdue": days_overdue,
        "grace_days_after_due": grace,
    }


@transaction.atomic
def deactivate_tenant_for_overdue(invoice: PlatformInvoice, *, as_of=None) -> bool:
    tenant = invoice.tenant
    tenant.refresh_from_db()
    if not tenant.is_active:
        return False
    if not _record_reminder(invoice, PlatformInvoiceReminder.Kind.TENANT_DEACTIVATED):
        return False

    tenant.is_active = False
    tenant.save(update_fields=["is_active"])

    title = "Workshop account suspended — unpaid platform invoice"
    message = (
        f"Your Mechanic360 access was suspended because invoice "
        f"{invoice.invoice_number} remains unpaid after the {grace_days_after_due()}-day grace period. "
        "Contact platform support or pay the invoice to restore access."
    )
    notify_tenant_admins(
        tenant=tenant,
        title=title,
        message=message,
        notif_type=Notification.Type.ERROR,
        link="/settings",
    )
    email_tenant_admins(
        tenant=tenant,
        subject=title,
        body=f"Dear {tenant.name},\n\n{message}\n\nMechanic360 Platform",
    )
    log_vehicle_event(
        entity=VehicleAuditEvent.Entity.BILLING,
        action=VehicleAuditEvent.Action.BILLING_CHANGED,
        vehicle=None,
        target_id=str(invoice.id),
        changes={"tenant_active": {"before": True, "after": False}},
        note=f"Tenant {tenant.name} suspended for overdue invoice {invoice.invoice_number}",
        explicit_tenant_schema=tenant.schema_name,
        explicit_tenant_name=tenant.name,
    )
    return True


def maybe_reactivate_tenant_after_payment(invoice: PlatformInvoice) -> bool:
    tenant = invoice.tenant
    tenant.refresh_from_db()
    if tenant.is_active:
        return False
    if tenant_has_open_subscription_debt(tenant=tenant, exclude=invoice):
        return False

    tenant.is_active = True
    tenant.save(update_fields=["is_active"])
    notify_tenant_admins(
        tenant=tenant,
        title="Workshop account restored",
        message=(
            f"Invoice {invoice.invoice_number} was marked paid. "
            "Your Mechanic360 workshop access is active again."
        ),
        notif_type=Notification.Type.SUCCESS,
        link="/dashboard",
    )
    log_vehicle_event(
        entity=VehicleAuditEvent.Entity.BILLING,
        action=VehicleAuditEvent.Action.BILLING_CHANGED,
        vehicle=None,
        target_id=str(invoice.id),
        changes={"tenant_active": {"before": False, "after": True}},
        note=f"Tenant {tenant.name} reactivated after payment of {invoice.invoice_number}",
        explicit_tenant_schema=tenant.schema_name,
        explicit_tenant_name=tenant.name,
    )
    return True


def process_subscription_billing_reminders(*, as_of=None) -> dict[str, int]:
    as_of_dt = as_of or timezone.now()
    as_of = as_of_dt.date()
    stats = {
        "reminders_sent": 0,
        "final_warnings": 0,
        "tenants_deactivated": 0,
    }

    for invoice in open_subscription_invoices():
        tenant = invoice.tenant
        due_date = invoice.due_at.date() if invoice.due_at else None
        period_end_date = invoice.period_end.date() if invoice.period_end else None
        days_until_due = _days_until(due_date, as_of=as_of)
        days_until_period_end = _days_until(period_end_date, as_of=as_of)
        days_overdue = _days_overdue(due_date, as_of=as_of)
        grace = grace_days_after_due()

        for target in _reminder_days_before_due():
            kind = _reminder_kind_for_due(target)
            if kind and days_until_due == target:
                sent = _send_reminder(
                    invoice=invoice,
                    kind=kind,
                    title=f"Invoice due in {target} day(s)",
                    message=(
                        f"Invoice {invoice.invoice_number} ({invoice.amount} {invoice.currency}) "
                        f"is due in {target} day(s). Pay before access is affected."
                    ),
                )
                if sent:
                    stats["reminders_sent"] += 1

        for target in _reminder_days_before_period_end():
            kind = _reminder_kind_for_period_end(target)
            if kind and days_until_period_end == target:
                sent = _send_reminder(
                    invoice=invoice,
                    kind=kind,
                    title=f"Membership period ends in {target} day(s)",
                    message=(
                        f"Your subscription period ends in {target} day(s). "
                        f"Invoice {invoice.invoice_number} is still unpaid — "
                        "renew to avoid interruption."
                    ),
                )
                if sent:
                    stats["reminders_sent"] += 1

        if days_overdue > 0 and days_overdue < grace:
            final_day = grace - 1
            if days_overdue == final_day:
                sent = _send_reminder(
                    invoice=invoice,
                    kind=PlatformInvoiceReminder.Kind.OVERDUE_FINAL,
                    title="Final warning — account suspension tomorrow",
                    message=(
                        f"Invoice {invoice.invoice_number} is {days_overdue} day(s) overdue. "
                        f"Your workshop will be suspended if payment is not received within "
                        f"{grace - days_overdue} day(s)."
                    ),
                    notif_type=Notification.Type.ERROR,
                )
                if sent:
                    stats["final_warnings"] += 1

        if days_overdue >= grace and tenant.is_active:
            if deactivate_tenant_for_overdue(invoice, as_of=as_of_dt):
                stats["tenants_deactivated"] += 1

    return stats
