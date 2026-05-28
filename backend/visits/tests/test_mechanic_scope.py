"""Mechanic role scope: vehicles + visit work only."""
from __future__ import annotations

from django.contrib.auth import get_user_model
from django.db import connection
from django.urls import reverse
from django.utils import timezone
from rest_framework import status
from rest_framework.test import APITestCase
from rest_framework_simplejwt.tokens import RefreshToken

from clients.models import Client
from tenancy.models import WorkshopTenant
from vehicles.models import ServiceVisit, Vehicle
from visits.models import ServiceCatalogItem, VisitLaborLine

User = get_user_model()


class MechanicScopeTests(APITestCase):
    def setUp(self):
        connection.set_schema("public")
        self.tenant = WorkshopTenant.objects.create(
            schema_name="scopeshop",
            name="Scope Shop",
        )
        self.admin = User.objects.create_user(
            username="scope_admin",
            password="adminpass123",
            role=User.Role.ADMIN,
            tenant=self.tenant,
        )
        self.mechanic = User.objects.create_user(
            username="scope_mech",
            password="mechpass123",
            role=User.Role.MECHANIC,
            tenant=self.tenant,
        )
        connection.set_schema(self.tenant.schema_name)
        owner = Client.objects.create(name="Client", type=Client.INDIVIDUAL)
        self.vehicle = Vehicle.objects.create(
            owner=owner,
            vin="VINSCOPE001",
            license_plate="SC-001",
            make="Ford",
            model="Focus",
            year=2018,
        )
        self.visit = ServiceVisit.objects.create(
            vehicle=self.vehicle,
            client=owner,
            mileage_km=10000,
            service_date=timezone.now(),
            status=ServiceVisit.Status.IN_PROGRESS,
        )
        self.catalog_item = ServiceCatalogItem.objects.create(
            name="Oil change",
            default_price=25,
        )
        connection.set_schema("public")

    def tearDown(self):
        connection.set_schema("public")

    def _auth(self, user: User) -> None:
        token = RefreshToken.for_user(user).access_token
        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {token}")

    def test_mechanic_cannot_edit_service_catalog(self):
        self._auth(self.mechanic)
        url = reverse("service-catalog-list")
        response = self.client.post(
            url,
            {"name": "New service", "default_price": "10.00"},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_mechanic_can_add_labor_line(self):
        self._auth(self.mechanic)
        url = reverse("visit-labor-lines-list")
        response = self.client.post(
            url,
            {
                "visit_id": str(self.visit.id),
                "description": "Brake pads",
                "hours": "1.5",
                "hourly_rate": "40.00",
                "total_price": "60.00",
            },
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        connection.set_schema(self.tenant.schema_name)
        line = VisitLaborLine.objects.get(visit=self.visit)
        self.assertEqual(line.performed_by_id, self.mechanic.id)
        connection.set_schema("public")

    def test_mechanic_cannot_create_visit(self):
        self._auth(self.mechanic)
        url = reverse("service-visit-list")
        connection.set_schema(self.tenant.schema_name)
        owner = Client.objects.first()
        response = self.client.post(
            url,
            {
                "vehicle_id": str(self.vehicle.id),
                "client_id": str(owner.id),
                "mileage_km": 12000,
            },
            format="json",
        )
        connection.set_schema("public")
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)
