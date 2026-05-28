"""
Tests for per-visit line mechanic attribution.
"""
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
from visits.models import VisitLaborLine, VisitServiceLine

User = get_user_model()


class VisitLineAttributionTests(APITestCase):
    def setUp(self):
        self.tenant = WorkshopTenant.objects.create(
            schema_name="lineshop",
            name="Line Shop",
        )
        self.admin = User.objects.create_user(
            username="line_admin",
            password="adminpass123",
            role=User.Role.ADMIN,
            tenant=self.tenant,
        )
        self.mechanic = User.objects.create_user(
            username="line_mech",
            password="mechpass123",
            role=User.Role.MECHANIC,
            tenant=self.tenant,
            first_name="Line",
            last_name="Mechanic",
        )
        connection.set_schema(self.tenant.schema_name)
        owner = Client.objects.create(name="Owner", type=Client.INDIVIDUAL)
        vehicle = Vehicle.objects.create(
            owner=owner,
            vin="VINLINE001",
            license_plate="LN-001",
            make="Ford",
            model="Focus",
            year=2018,
        )
        self.visit = ServiceVisit.objects.create(
            vehicle=vehicle,
            client=owner,
            service_date=timezone.now(),
            created_by=self.admin,
        )
        connection.set_schema("public")
        self.service_lines_url = reverse("visit-service-lines-list")

    def tearDown(self):
        connection.set_schema("public")

    def _auth(self, user: User) -> None:
        token = RefreshToken.for_user(user).access_token
        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {token}")

    def test_mechanic_service_line_defaults_performed_by(self):
        self._auth(self.mechanic)
        response = self.client.post(
            self.service_lines_url,
            {
                "visit_id": str(self.visit.id),
                "description": "Oil change",
                "quantity": "1",
                "unit_price": "45",
                "total_price": "45",
            },
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(response.data["performed_by"]["username"], "line_mech")

    def test_admin_assigns_mechanic_on_service_line(self):
        self._auth(self.admin)
        response = self.client.post(
            self.service_lines_url,
            {
                "visit_id": str(self.visit.id),
                "description": "Brake pads",
                "quantity": "1",
                "unit_price": "120",
                "total_price": "120",
                "performed_by_id": str(self.mechanic.id),
            },
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(response.data["performed_by"]["id"], str(self.mechanic.id))

    def test_visits_filter_by_mechanic(self):
        connection.set_schema(self.tenant.schema_name)
        VisitServiceLine.objects.create(
            visit=self.visit,
            description="Assigned work",
            quantity=1,
            unit_price=50,
            total_price=50,
            performed_by=self.mechanic,
        )
        connection.set_schema("public")

        self._auth(self.admin)
        response = self.client.get(reverse("service-visit-list"), {"mechanic": str(self.mechanic.id)})
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        ids = {row["id"] for row in response.data}
        self.assertIn(str(self.visit.id), ids)

    def test_mechanics_analytics_summary(self):
        connection.set_schema(self.tenant.schema_name)
        VisitServiceLine.objects.create(
            visit=self.visit,
            description="Labor attribution",
            quantity=1,
            unit_price=30,
            total_price=30,
            performed_by=self.mechanic,
        )
        VisitLaborLine.objects.create(
            visit=self.visit,
            description="Diagnostics",
            hours=1,
            hourly_rate=40,
            total_price=40,
            performed_by=self.mechanic,
        )
        self.visit.status = ServiceVisit.Status.COMPLETED
        self.visit.save(update_fields=["status"])
        connection.set_schema("public")

        self._auth(self.admin)
        response = self.client.get(reverse("analytics-mechanics"), {"days": 30})
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(len(response.data["mechanics"]), 1)
        row = response.data["mechanics"][0]
        self.assertEqual(row["service_lines"], 1)
        self.assertEqual(row["labor_lines"], 1)
        self.assertEqual(row["visits_completed"], 1)
