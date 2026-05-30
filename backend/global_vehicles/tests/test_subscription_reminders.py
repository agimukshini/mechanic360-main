"""
Tests for subscription billing reminders and suspension policy (option C).
"""
from __future__ import annotations

from datetime import datetime, timedelta
from decimal import Decimal

from django.contrib.auth import get_user_model
from django.test import TestCase, override_settings
from django.utils import timezone

from accounts.notifications import Notification
from global_vehicles.invoice_services import issue_subscription_invoice, update_platform_invoice
from global_vehicles.models import PlatformInvoice, PlatformInvoiceReminder, TenantPlatformBilling, TransferBilling
from global_vehicles.subscription_reminder_services import (
    build_billing_status,
    process_subscription_billing_reminders,
)
from tenancy.models import WorkshopTenant

User = get_user_model()


class SubscriptionReminderTests(TestCase):
    def setUp(self):
        self.tenant = WorkshopTenant.objects.create(
            name="Reminder Shop",
            schema_name="reminder_shop",
            contact_email="billing@reminder.test",
        )
        self.admin = User.objects.create_user(
            username="shop_admin",
            password="x",
            role=User.Role.ADMIN,
            tenant=self.tenant,
            email="admin@reminder.test",
        )
        self.superadmin = User.objects.create_superuser(
            username="root",
            email="root@example.com",
            password="x",
        )
        billing = TenantPlatformBilling.for_tenant(self.tenant)
        billing.subscription_fee_amount = Decimal("25.00")
        billing.subscription_period = TenantPlatformBilling.SubscriptionPeriod.MONTHLY
        billing.subscription_next_charge_at = timezone.now() - timedelta(days=1)
        billing.save()

    def _issue_invoice(self) -> PlatformInvoice:
        billing = TenantPlatformBilling.for_tenant(self.tenant)
        invoice = issue_subscription_invoice(billing=billing)
        assert invoice is not None
        return invoice

    def test_issue_invoice_notifies_admins(self):
        invoice = self._issue_invoice()
        self.assertTrue(
            PlatformInvoiceReminder.objects.filter(
                invoice=invoice,
                kind=PlatformInvoiceReminder.Kind.INVOICE_ISSUED,
            ).exists(),
        )
        self.assertEqual(Notification.objects.filter(user=self.admin).count(), 1)

    @override_settings(PLATFORM_BILLING_GRACE_DAYS_AFTER_DUE=14)
    def test_due_reminder_sent_on_exact_day(self):
        invoice = self._issue_invoice()
        as_of = invoice.due_at.date() - timedelta(days=7)
        stats = process_subscription_billing_reminders(as_of=timezone.make_aware(
            datetime.combine(as_of, datetime.min.time()),
        ))
        self.assertEqual(stats["reminders_sent"], 1)
        self.assertTrue(
            PlatformInvoiceReminder.objects.filter(
                invoice=invoice,
                kind=PlatformInvoiceReminder.Kind.DUE_7D,
            ).exists(),
        )

    @override_settings(PLATFORM_BILLING_GRACE_DAYS_AFTER_DUE=14)
    def test_period_end_reminder_sent(self):
        invoice = self._issue_invoice()
        as_of = invoice.period_end.date() - timedelta(days=1)
        stats = process_subscription_billing_reminders(as_of=timezone.make_aware(
            datetime.combine(as_of, datetime.min.time()),
        ))
        self.assertEqual(stats["reminders_sent"], 1)
        self.assertTrue(
            PlatformInvoiceReminder.objects.filter(
                invoice=invoice,
                kind=PlatformInvoiceReminder.Kind.PERIOD_END_1D,
            ).exists(),
        )

    @override_settings(PLATFORM_BILLING_GRACE_DAYS_AFTER_DUE=3)
    def test_overdue_deactivates_tenant_after_grace(self):
        invoice = self._issue_invoice()
        as_of = invoice.due_at + timedelta(days=3)
        stats = process_subscription_billing_reminders(as_of=as_of)
        self.tenant.refresh_from_db()
        self.assertEqual(stats["tenants_deactivated"], 1)
        self.assertFalse(self.tenant.is_active)

    def test_payment_reactivates_suspended_tenant(self):
        invoice = self._issue_invoice()
        self.tenant.is_active = False
        self.tenant.save()
        update_platform_invoice(
            invoice=invoice,
            superadmin=self.superadmin,
            new_status=TransferBilling.PaymentStatus.PAID,
        )
        self.tenant.refresh_from_db()
        self.assertTrue(self.tenant.is_active)

    def test_build_billing_status_warning(self):
        invoice = self._issue_invoice()
        invoice.due_at = timezone.now() + timedelta(days=5)
        invoice.save(update_fields=["due_at"])
        status = build_billing_status(tenant=self.tenant)
        self.assertEqual(status["alert_level"], "warning")
        self.assertEqual(status["message_key"], "due_warning")
