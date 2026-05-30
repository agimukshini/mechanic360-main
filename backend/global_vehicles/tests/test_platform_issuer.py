"""
Tests for platform issuer profile and invoice PDF VAT.
"""
from __future__ import annotations

from datetime import timedelta
from decimal import Decimal

from django.contrib.auth import get_user_model
from django.test import TestCase
from django.urls import reverse
from django.utils import timezone
from rest_framework import status
from rest_framework.test import APIClient

from global_vehicles.invoice_pdf import render_platform_invoice_pdf
from global_vehicles.invoice_services import issue_subscription_invoice
from global_vehicles.issuer_services import vat_breakdown
from global_vehicles.models import PlatformIssuerProfile, TenantPlatformBilling
from tenancy.models import WorkshopTenant

User = get_user_model()


class PlatformIssuerProfileTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.superuser = User.objects.create_superuser(
            username="issuer_admin",
            email="issuer@example.com",
            password="pass12345",
        )
        self.tenant = WorkshopTenant.objects.create(
            name="PDF Shop",
            schema_name="pdf_shop",
        )
        self.billing = TenantPlatformBilling.for_tenant(self.tenant)
        self.billing.subscription_fee_amount = Decimal("49.00")
        self.billing.subscription_period = TenantPlatformBilling.SubscriptionPeriod.MONTHLY
        self.billing.subscription_next_charge_at = timezone.now() - timedelta(days=1)
        self.billing.save()

    def test_superadmin_can_update_issuer_profile(self):
        self.client.force_authenticate(user=self.superuser)
        response = self.client.patch(
            reverse("admin-platform-issuer"),
            {
                "company_name": "Mechanic360 Sh.p.k.",
                "trade_name": "Workshop360",
                "vat_number": "K12345678A",
                "vat_rate_percent": "20.00",
                "address_line1": "Rruga e Dibrës 1",
                "city": "Tirana",
                "country": "Albania",
            },
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        profile = PlatformIssuerProfile.load()
        self.assertEqual(profile.company_name, "Mechanic360 Sh.p.k.")
        self.assertEqual(profile.vat_number, "K12345678A")
        self.assertEqual(profile.vat_rate_percent, Decimal("20.00"))

    def test_vat_breakdown_when_amount_includes_vat(self):
        totals = vat_breakdown(
            Decimal("49.00"),
            rate_percent=Decimal("20.00"),
            amounts_include_vat=True,
        )
        self.assertEqual(totals["gross"], Decimal("49.00"))
        self.assertEqual(totals["net"], Decimal("40.83"))
        self.assertEqual(totals["vat"], Decimal("8.17"))

    def test_invoice_pdf_includes_issuer_and_vat(self):
        profile = PlatformIssuerProfile.load()
        profile.company_name = "Mechanic360 Sh.p.k."
        profile.trade_name = "Workshop360"
        profile.vat_number = "K12345678A"
        profile.vat_rate_percent = Decimal("20.00")
        profile.address_line1 = "Rruga e Dibrës 1"
        profile.city = "Tirana"
        profile.save()

        invoice = issue_subscription_invoice(billing=self.billing)
        self.assertIsNotNone(invoice)
        self.assertIn("issuer", invoice.snapshot)

        response = render_platform_invoice_pdf(invoice)
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response["Content-Type"], "application/pdf")
        self.assertGreater(len(response.content), 500)

        from django.template.loader import render_to_string

        from global_vehicles.invoice_pdf import build_platform_invoice_context

        ctx = build_platform_invoice_context(invoice)
        rendered = render_to_string("reports/platform_invoice.html", ctx)
        self.assertIn("Mechanic360 Sh.p.k.", rendered)
        self.assertIn("K12345678A", rendered)
        self.assertIn("Faturë Platforme", rendered)
