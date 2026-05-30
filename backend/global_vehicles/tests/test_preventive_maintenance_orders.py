"""Tests for cross-tenant preventive maintenance work orders."""
from __future__ import annotations

from datetime import date, timedelta

from django.contrib.auth import get_user_model
from django.db import connection
from django.urls import reverse
from django_tenants.utils import schema_context
from rest_framework import status
from rest_framework.test import APITestCase

from global_vehicles.models import GlobalVehicle, PreventiveMaintenanceOrder
from global_vehicles.pm_kinds import PMKind
from global_vehicles.pm_services import upsert_open_pm_order
from tenancy.models import WorkshopTenant
from tenancy.views import public_schema
from vehicles.models import Vehicle
from visits.models import ServiceCatalogItem

User = get_user_model()


class PreventiveMaintenanceOrderApiTests(APITestCase):
    """
    Tenant schemas are created in setUpClass so django-tenants migrations run
    outside the per-test transaction (visits 0006/0007 DDL is not safe inside
    TestCase atomic blocks).
    """

    @classmethod
    def setUpClass(cls):
        super().setUpClass()
        cls.tenant_a = WorkshopTenant.objects.create(
            schema_name="pm_shop_a",
            name="Shop PM A",
            language="en",
            currency="EUR",
        )
        cls.tenant_b = WorkshopTenant.objects.create(
            schema_name="pm_shop_b",
            name="Shop PM B",
            language="en",
            currency="EUR",
        )

        cls.admin_a = User.objects.create_user(
            username="admin_pma",
            email="admin_pma@test.com",
            password="pass12345",
            role=User.Role.ADMIN,
            tenant=cls.tenant_a,
        )
        cls.admin_b = User.objects.create_user(
            username="admin_pmb",
            email="admin_pmb@test.com",
            password="pass12345",
            role=User.Role.ADMIN,
            tenant=cls.tenant_b,
        )

        with public_schema():
            cls.global_vehicle = GlobalVehicle.objects.create(
                vin="PMTESTVIN001",
                license_plate="PM-001",
                make="VW",
                model="Golf",
                year=2018,
            )
            cls.order = upsert_open_pm_order(
                global_vehicle_id=cls.global_vehicle.id,
                pm_kind=PMKind.REGULAR,
                due_date=date.today() + timedelta(days=14),
                due_odometer_km=120_000,
                created_by_tenant=cls.tenant_a,
            )
            upsert_open_pm_order(
                global_vehicle_id=cls.global_vehicle.id,
                pm_kind=PMKind.TIRE,
                due_date=date.today() + timedelta(days=30),
                created_by_tenant=cls.tenant_a,
            )

        with schema_context(cls.tenant_a.schema_name):
            ServiceCatalogItem.objects.update(pm_kind="")
            ServiceCatalogItem.objects.create(
                name="Oil Change PM Test",
                pm_kind=PMKind.REGULAR,
                is_active=True,
            )
            cls.local_vehicle_a = Vehicle.objects.create(
                global_vehicle_id=cls.global_vehicle.id,
                vin=cls.global_vehicle.vin,
                license_plate=cls.global_vehicle.license_plate,
                make=cls.global_vehicle.make,
                model=cls.global_vehicle.model,
                year=cls.global_vehicle.year,
            )

        with schema_context(cls.tenant_b.schema_name):
            ServiceCatalogItem.objects.update(pm_kind="")
            ServiceCatalogItem.objects.create(
                name="Tires only",
                pm_kind=PMKind.TIRE,
                is_active=True,
            )
            Vehicle.objects.create(
                global_vehicle_id=cls.global_vehicle.id,
                vin=cls.global_vehicle.vin,
                license_plate=cls.global_vehicle.license_plate,
                make=cls.global_vehicle.make,
                model=cls.global_vehicle.model,
                year=cls.global_vehicle.year,
            )

        cls.list_url = reverse("pm-order-list")

    @classmethod
    def tearDownClass(cls):
        connection.set_schema("public")
        super().tearDownClass()

    def tearDown(self):
        connection.set_schema("public")

    def test_shop_a_sees_regular_not_tire(self):
        self.client.force_authenticate(user=self.admin_a)
        response = self.client.get(self.list_url, HTTP_HOST="localhost")
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        kinds = {row["pm_kind"] for row in response.data["results"]}
        self.assertIn(PMKind.REGULAR, kinds)
        self.assertNotIn(PMKind.TIRE, kinds)

    def test_shop_b_sees_tire_not_regular(self):
        self.client.force_authenticate(user=self.admin_b)
        response = self.client.get(self.list_url, HTTP_HOST="localhost")
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        kinds = {row["pm_kind"] for row in response.data["results"]}
        self.assertIn(PMKind.TIRE, kinds)
        self.assertNotIn(PMKind.REGULAR, kinds)

    def test_shop_without_catalog_sees_none(self):
        with schema_context(self.tenant_a.schema_name):
            ServiceCatalogItem.objects.update(pm_kind="")
        try:
            self.client.force_authenticate(user=self.admin_a)
            response = self.client.get(self.list_url, HTTP_HOST="localhost")
            self.assertEqual(response.status_code, status.HTTP_200_OK)
            self.assertEqual(response.data["count"], 0)
        finally:
            with schema_context(self.tenant_a.schema_name):
                ServiceCatalogItem.objects.filter(name="Oil Change PM Test").update(
                    pm_kind=PMKind.REGULAR,
                )

    def test_workshop_cannot_manually_complete_pm_order(self):
        self.client.force_authenticate(user=self.admin_a)
        url = reverse("pm-order-detail", kwargs={"pk": self.order.id})
        response = self.client.patch(url, {"status": "completed"}, format="json", HTTP_HOST="localhost")
        self.assertEqual(response.status_code, status.HTTP_405_METHOD_NOT_ALLOWED)

    def test_create_order_requires_matching_catalog(self):
        self.client.force_authenticate(user=self.admin_a)
        response = self.client.post(
            self.list_url,
            {
                "global_vehicle_id": str(self.global_vehicle.id),
                "local_vehicle_id": str(self.local_vehicle_a.id),
                "pm_kind": PMKind.TIRE,
                "due_date": str(date.today() + timedelta(days=7)),
            },
            format="json",
            HTTP_HOST="localhost",
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
