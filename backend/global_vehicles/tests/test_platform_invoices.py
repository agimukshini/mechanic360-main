"""
Tests for platform subscription invoicing.
"""
from __future__ import annotations

from datetime import timedelta
from decimal import Decimal

from django.contrib.auth import get_user_model
from django.test import TestCase
from django.utils import timezone

from global_vehicles.invoice_services import (
    add_billing_period,
    issue_subscription_invoice,
    process_due_subscription_invoices,
    update_platform_invoice,
)
from global_vehicles.models import PlatformInvoice, TenantPlatformBilling, TransferBilling
from global_vehicles.transfer_services import update_tenant_platform_billing
from tenancy.models import WorkshopTenant

User = get_user_model()


class SubscriptionInvoiceTests(TestCase):
    def setUp(self):
        self.tenant = WorkshopTenant.objects.create(
            name="Invoice Shop",
            schema_name="invoice_shop",
        )
        self.superadmin = User.objects.create_superuser(
            username="billing_root",
            email="billing@example.com",
            password="x",
        )
        self.billing = TenantPlatformBilling.for_tenant(self.tenant)
        self.billing.subscription_fee_amount = Decimal("49.00")
        self.billing.subscription_fee_currency = "EUR"
        self.billing.subscription_period = TenantPlatformBilling.SubscriptionPeriod.MONTHLY
        self.billing.subscription_next_charge_at = timezone.now() - timedelta(days=1)
        self.billing.save()

    def test_issue_subscription_invoice_creates_row_and_advances_next_charge(self):
        before = self.billing.subscription_next_charge_at
        invoice = issue_subscription_invoice(billing=self.billing)
        self.assertIsNotNone(invoice)
        self.assertEqual(invoice.kind, PlatformInvoice.Kind.SUBSCRIPTION)
        self.assertEqual(invoice.amount, Decimal("49.00"))
        self.assertTrue(invoice.invoice_number.startswith("INV-"))
        self.assertEqual(len(invoice.line_items), 1)

        self.billing.refresh_from_db()
        self.assertGreater(self.billing.subscription_next_charge_at, before)
        self.assertEqual(
            self.billing.subscription_next_charge_at,
            add_billing_period(before, TenantPlatformBilling.SubscriptionPeriod.MONTHLY),
        )

    def test_process_due_subscription_invoices_skips_future_charge(self):
        self.billing.subscription_next_charge_at = timezone.now() + timedelta(days=5)
        self.billing.save()
        issued = process_due_subscription_invoices()
        self.assertEqual(issued, [])

    def test_update_platform_invoice_marks_paid(self):
        invoice = issue_subscription_invoice(billing=self.billing)
        update_platform_invoice(
            invoice=invoice,
            superadmin=self.superadmin,
            new_status=TransferBilling.PaymentStatus.PAID,
            invoice_reference="BANK-123",
        )
        invoice.refresh_from_db()
        self.assertEqual(invoice.payment_status, TransferBilling.PaymentStatus.PAID)
        self.assertEqual(invoice.invoice_reference, "BANK-123")
        self.assertIsNotNone(invoice.paid_at)
        self.assertEqual(invoice.captured_by_id, self.superadmin.id)

    def test_enabling_subscription_sets_next_charge_when_missing(self):
        billing = TenantPlatformBilling.for_tenant(
            WorkshopTenant.objects.create(name="New", schema_name="new_shop"),
        )
        update_tenant_platform_billing(
            billing=billing,
            superadmin=self.superadmin,
            fields={"subscription_period": TenantPlatformBilling.SubscriptionPeriod.YEARLY},
        )
        billing.refresh_from_db()
        self.assertIsNotNone(billing.subscription_next_charge_at)

    def test_issue_returns_none_when_subscription_disabled(self):
        self.billing.subscription_period = TenantPlatformBilling.SubscriptionPeriod.NONE
        self.billing.save()
        self.assertIsNone(issue_subscription_invoice(billing=self.billing))
