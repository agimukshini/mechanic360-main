"""
Tests for vehicle assignment to workshop mechanics.
"""
from __future__ import annotations

from django.contrib.auth import get_user_model
from django.db import connection
from django.urls import reverse
from rest_framework import status
from rest_framework.test import APITestCase
from rest_framework_simplejwt.tokens import RefreshToken

from clients.models import Client
from tenancy.models import WorkshopTenant
from vehicles.models import Vehicle

User = get_user_model()


class VehicleMechanicAssignmentTests(APITestCase):
    def setUp(self):
        self.tenant = WorkshopTenant.objects.create(
            schema_name="assignshop",
            name="Assign Shop",
        )
        self.admin = User.objects.create_user(
            username="assign_admin",
            password="adminpass123",
            role=User.Role.ADMIN,
            tenant=self.tenant,
        )
        self.mechanic_a = User.objects.create_user(
            username="mech_a",
            password="mechpass123",
            role=User.Role.MECHANIC,
            tenant=self.tenant,
        )
        self.mechanic_b = User.objects.create_user(
            username="mech_b",
            password="mechpass123",
            role=User.Role.MECHANIC,
            tenant=self.tenant,
        )
        connection.set_schema(self.tenant.schema_name)
        owner = Client.objects.create(name="Client One", type=Client.INDIVIDUAL)
        self.vehicle_a = Vehicle.objects.create(
            owner=owner,
            vin="VINASSIGN001",
            license_plate="AS-001",
            make="Toyota",
            model="Yaris",
            year=2019,
            assigned_mechanic=self.mechanic_a,
        )
        self.vehicle_b = Vehicle.objects.create(
            owner=owner,
            vin="VINASSIGN002",
            license_plate="AS-002",
            make="Honda",
            model="Civic",
            year=2020,
            assigned_mechanic=self.mechanic_b,
        )
        connection.set_schema("public")
        self.vehicles_url = reverse("vehicle-list")

    def tearDown(self):
        connection.set_schema("public")

    def _authenticate(self, user: User) -> None:
        token = RefreshToken.for_user(user).access_token
        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {token}")

    def test_mechanic_sees_all_workshop_vehicles(self):
        self._authenticate(self.mechanic_a)
        response = self.client.get(self.vehicles_url)

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        plates = {row["license_plate"] for row in response.data}
        self.assertEqual(plates, {"AS-001", "AS-002"})

    def test_admin_assigns_vehicle_to_mechanic(self):
        self._authenticate(self.admin)
        detail_url = reverse("vehicle-detail", kwargs={"pk": self.vehicle_b.id})
        response = self.client.patch(
            detail_url,
            {"assigned_mechanic_id": str(self.mechanic_a.id)},
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        connection.set_schema(self.tenant.schema_name)
        self.vehicle_b.refresh_from_db()
        self.assertEqual(self.vehicle_b.assigned_mechanic_id, self.mechanic_a.id)
        connection.set_schema("public")

    def test_mechanic_cannot_assign_vehicle(self):
        self._authenticate(self.mechanic_a)
        detail_url = reverse("vehicle-detail", kwargs={"pk": self.vehicle_a.id})
        response = self.client.patch(
            detail_url,
            {"assigned_mechanic_id": str(self.mechanic_b.id)},
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
