"""
Ownerless vehicles and mechanic vehicle management.
"""
from __future__ import annotations

from django.contrib.auth import get_user_model
from django.db import connection
from django.urls import reverse
from rest_framework import status
from rest_framework.test import APITestCase
from rest_framework_simplejwt.tokens import RefreshToken

from clients.models import Client
from global_vehicles.models import GlobalOwner, GlobalVehicle, VehicleOwnership
from tenancy.models import WorkshopTenant
from tenancy.views import public_schema
from vehicles.global_sync import sync_vehicle_to_global
from vehicles.models import Vehicle

User = get_user_model()


class OwnerlessVehicleTests(APITestCase):
    def setUp(self):
        self.tenant = WorkshopTenant.objects.create(
            schema_name="ownerlessshop",
            name="Ownerless Shop",
        )
        self.admin = User.objects.create_user(
            username="ownerless_admin",
            password="adminpass123",
            role=User.Role.ADMIN,
            tenant=self.tenant,
        )
        self.mechanic = User.objects.create_user(
            username="ownerless_mech",
            password="mechpass123",
            role=User.Role.MECHANIC,
            tenant=self.tenant,
        )
        connection.set_schema(self.tenant.schema_name)
        self.client_record = Client.objects.create(name="Paper Client", type=Client.INDIVIDUAL)
        connection.set_schema("public")
        self.vehicles_url = reverse("vehicle-list")

    def tearDown(self):
        connection.set_schema("public")

    def _authenticate(self, user: User) -> None:
        token = RefreshToken.for_user(user).access_token
        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {token}")

    def test_admin_creates_vehicle_without_owner(self):
        self._authenticate(self.admin)
        response = self.client.post(
            self.vehicles_url,
            {
                "vin": "VINOWNERLESS01",
                "license_plate": "OL-001",
                "make": "Ford",
                "model": "Focus",
                "year": 2018,
            },
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertIsNone(response.data.get("owner"))

        connection.set_schema(self.tenant.schema_name)
        vehicle = Vehicle.objects.get(vin="VINOWNERLESS01")
        self.assertIsNone(vehicle.owner_id)
        self.assertIsNone(vehicle.odometer_km)
        self.assertIsNone(vehicle.hour_meter)
        connection.set_schema("public")

    def test_admin_creates_vehicle_with_miles_and_no_hours(self):
        self._authenticate(self.admin)
        response = self.client.post(
            self.vehicles_url,
            {
                "vin": "VINMILES001",
                "license_plate": "MI-001",
                "make": "Ford",
                "model": "F-150",
                "year": 2021,
                "odometer_km": 80467,
                "odometer_unit": "mi",
            },
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(response.data["odometer_unit"], "mi")
        self.assertIsNone(response.data.get("hour_meter"))

        connection.set_schema(self.tenant.schema_name)
        vehicle = Vehicle.objects.get(vin="VINMILES001")
        self.assertEqual(vehicle.odometer_km, 80467)
        self.assertIsNone(vehicle.hour_meter)
        connection.set_schema("public")

    def test_mechanic_creates_vehicle_without_owner(self):
        self._authenticate(self.mechanic)
        response = self.client.post(
            self.vehicles_url,
            {
                "vin": "VINOWNERLESS02",
                "license_plate": "OL-002",
                "make": "VW",
                "model": "Golf",
                "year": 2020,
            },
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertIsNone(response.data.get("owner"))

    def test_mechanic_assigns_workshop_client_owner(self):
        connection.set_schema(self.tenant.schema_name)
        vehicle = Vehicle.objects.create(
            owner=None,
            vin="VINASSIGNOWN01",
            license_plate="AO-001",
            make="BMW",
            model="320",
            year=2021,
        )
        connection.set_schema("public")

        self._authenticate(self.mechanic)
        detail_url = reverse("vehicle-detail", kwargs={"pk": vehicle.id})
        response = self.client.patch(
            detail_url,
            {"owner_id": str(self.client_record.id)},
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        connection.set_schema(self.tenant.schema_name)
        vehicle.refresh_from_db()
        self.assertEqual(vehicle.owner_id, self.client_record.id)
        connection.set_schema("public")

    def test_mechanic_can_generate_owner_claim_qr(self):
        connection.set_schema(self.tenant.schema_name)
        vehicle = Vehicle.objects.create(
            owner=None,
            vin="VINQR001",
            license_plate="QR-001",
            make="Audi",
            model="A3",
            year=2019,
        )
        connection.set_schema("public")

        self._authenticate(self.mechanic)
        claim_url = reverse("vehicle-owner-claim-qr", kwargs={"pk": vehicle.id})
        response = self.client.post(claim_url)

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertIn("qr_code", response.data)

    def test_mechanic_can_generate_transfer_qr(self):
        connection.set_schema(self.tenant.schema_name)
        owner = Client.objects.create(name="Seller", type=Client.INDIVIDUAL)
        vehicle = Vehicle.objects.create(
            owner=owner,
            vin="VINTRANSFER01",
            license_plate="TR-001",
            make="Mercedes",
            model="C200",
            year=2017,
        )
        sync_vehicle_to_global(vehicle=vehicle, user=self.admin, tenant=self.tenant)
        with public_schema():
            global_vehicle = GlobalVehicle.objects.get(id=vehicle.global_vehicle_id)
            global_owner = GlobalOwner.objects.create(
                name="Registered Owner",
                email="registered@example.com",
            )
            VehicleOwnership.objects.create(
                vehicle=global_vehicle,
                owner=global_owner,
                license_plate=vehicle.license_plate,
            )
        connection.set_schema("public")

        self._authenticate(self.mechanic)
        transfer_url = reverse("vehicle-transfer-qr", kwargs={"pk": vehicle.id})
        response = self.client.post(
            transfer_url,
            {"documents_verified": True, "new_license_plate": "TR-002"},
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertIn("qr_code", response.data)
