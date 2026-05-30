"""
Tests for subscription period resolution (tenant admin timeline).
"""
from __future__ import annotations

from datetime import timedelta
from decimal import Decimal

from django.test import TestCase
from django.utils import timezone

from global_vehicles.invoice_services import issue_subscription_invoice
from global_vehicles.models import PlatformInvoice, TenantPlatformBilling
from tenancy.models import WorkshopTenant
from tenancy.subscription_period import resolve_tenant_subscription_period
from tenancy.stats import tenant_subscription_dict


class SubscriptionPeriodTests(TestCase):
    def setUp(self):
        self.tenant = WorkshopTenant.objects.create(
            name="Timeline Shop",
            schema_name="timeline_shop",
        )
        self.billing = TenantPlatformBilling.for_tenant(self.tenant)
        self.billing.subscription_fee_amount = Decimal("49.00")
        self.billing.subscription_fee_currency = "EUR"
        self.billing.subscription_period = TenantPlatformBilling.SubscriptionPeriod.MONTHLY
        self.billing.subscription_next_charge_at = timezone.now() - timedelta(days=2)
        self.billing.save()

    def test_before_first_invoice_uses_next_charge_as_period_start(self):
        bounds = resolve_tenant_subscription_period(self.tenant, self.billing)
        self.assertEqual(bounds["subscription_period_start"], self.billing.subscription_next_charge_at)
        self.assertGreater(bounds["subscription_period_end"], bounds["subscription_period_start"])
        self.assertIsNotNone(bounds["subscription_days_remaining"])

    def test_after_invoice_uses_next_charge_as_period_end(self):
        invoice = issue_subscription_invoice(billing=self.billing)
        self.assertIsNotNone(invoice)
        self.billing.refresh_from_db()

        bounds = resolve_tenant_subscription_period(self.tenant, self.billing)
        self.assertEqual(bounds["subscription_period_end"], self.billing.subscription_next_charge_at)
        self.assertEqual(bounds["subscription_period_start"], invoice.period_start)
        self.assertEqual(bounds["subscription_period_end"], invoice.period_end)

    def test_open_invoice_period_overrides_billing_schedule(self):
        invoice = issue_subscription_invoice(billing=self.billing)
        bounds = resolve_tenant_subscription_period(self.tenant, self.billing)
        self.assertEqual(bounds["subscription_period_start"], invoice.period_start)
        self.assertEqual(bounds["subscription_period_end"], invoice.period_end)

    def test_free_subscription_has_no_period(self):
        self.billing.subscription_period = TenantPlatformBilling.SubscriptionPeriod.NONE
        self.billing.save()
        bounds = resolve_tenant_subscription_period(self.tenant, self.billing)
        self.assertIsNone(bounds["subscription_period_start"])
        self.assertIsNone(bounds["subscription_period_end"])

    def test_tenant_subscription_dict_includes_period_bounds(self):
        payload = tenant_subscription_dict(self.tenant)
        self.assertIn("subscription_period_start", payload)
        self.assertIn("subscription_period_end", payload)
        self.assertIn("subscription_days_remaining", payload)
        self.assertIsNotNone(payload["subscription_period_start"])
