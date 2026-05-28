"""
Tests for superadmin dashboard and tenant stats endpoints.
"""
from __future__ import annotations

from django.contrib.auth import get_user_model
from django.db import connection
from django.test import TestCase
from django.urls import reverse

from clients.models import Client
from global_vehicles.models import GlobalVehicle
from rest_framework import status
from rest_framework.test import APIClient

from tenancy.models import WorkshopTenant
from tenancy.onboarding import approve_onboarding_application
from tenancy.models import TenantOnboardingApplication
from tenancy.onboarding import hash_admin_password

User = get_user_model()


class SuperadminDashboardTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.superuser = User.objects.create_superuser(
            username="platform_admin",
            email="admin@example.com",
            password="superpass123",
        )
        self.application = TenantOnboardingApplication.objects.create(
            workshop_name="Beta Garage",
            admin_username="beta_admin",
            admin_email="beta@example.com",
            admin_password_hash=hash_admin_password("securepass123"),
        )
        self.tenant = approve_onboarding_application(self.application, self.superuser)

        connection.set_schema(self.tenant.schema_name)
        Client.objects.create(name="Jane Doe", type=Client.INDIVIDUAL)
        connection.set_schema("public")

        GlobalVehicle.objects.create(
            vin="1HGCM82633A123456",
            license_plate="ABC-123",
            make="Toyota",
            model="Camry",
            year=2020,
            registered_by_tenant=self.tenant,
        )

    def tearDown(self):
        connection.set_schema("public")

    def test_dashboard_requires_superuser(self):
        user = User.objects.create_user(username="staff", password="pass12345")
        self.client.force_authenticate(user=user)
        response = self.client.get(reverse("admin-dashboard"))
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_dashboard_returns_platform_and_tenant_stats(self):
        self.client.force_authenticate(user=self.superuser)
        response = self.client.get(reverse("admin-dashboard"))

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertGreaterEqual(response.data["platform"]["tenants_total"], 1)
        self.assertGreaterEqual(response.data["platform"]["global_vehicles"], 1)

        tenant_row = next(
            row for row in response.data["tenants"] if row["id"] == str(self.tenant.id)
        )
        self.assertEqual(tenant_row["stats"]["clients"], 1)
        self.assertEqual(tenant_row["stats"]["global_vehicles_registered"], 1)

    def test_tenant_detail_includes_stats(self):
        self.client.force_authenticate(user=self.superuser)
        url = reverse("admin-tenants-detail", kwargs={"pk": self.tenant.id})
        response = self.client.get(url)

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["stats"]["clients"], 1)

    def test_global_registry_summary(self):
        self.client.force_authenticate(user=self.superuser)
        response = self.client.get(reverse("admin-global"))

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertGreaterEqual(response.data["summary"]["global_vehicles"], 1)
        self.assertGreaterEqual(len(response.data["recent_vehicles"]), 1)
