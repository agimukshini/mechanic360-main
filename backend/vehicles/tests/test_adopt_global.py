from __future__ import annotations

from django.contrib.auth import get_user_model
from django.db import connection
from django.test import TestCase
from rest_framework.test import APIClient
from rest_framework_simplejwt.tokens import RefreshToken

from global_vehicles.models import GlobalVehicle
from tenancy.models import WorkshopTenant
from tenancy.views import public_schema
from vehicles.models import Vehicle

User = get_user_model()


class AdoptGlobalVehicleTests(TestCase):
    """
    A workshop discovers a vehicle in the global registry that some other
    shop registered first and wants to adopt it locally so they can run
    visits against it. This must not duplicate the global record, must
    inherit fields from the global one, and must be idempotent.
    """

    def setUp(self):
        self.tenant = WorkshopTenant.objects.create(
            name="Adopt Shop",
            schema_name="adoptshop",
        )
        self.user = User.objects.create_user(
            username="adopt_user",
            password="testpass123",
            role=User.Role.ADMIN,
            tenant=self.tenant,
        )
        with public_schema():
            self.global_vehicle = GlobalVehicle.objects.create(
                vin="WVWADOPT0000001AA",
                license_plate="GL-ADOPT-1",
                make="Ford",
                model="Focus",
                year=2018,
                engine_type="1.6 TDCi",
                fuel_type="diesel",
                odometer_km=120_000,
            )
        self.api = APIClient()
        token = RefreshToken.for_user(self.user).access_token
        self.api.credentials(HTTP_AUTHORIZATION=f"Bearer {token}")

    def tearDown(self):
        connection.set_schema("public")

    def _post_adopt(self, payload):
        return self.api.post("/api/v1/vehicles/adopt-global/", payload, format="json")

    def test_adopt_creates_local_vehicle_inheriting_global_fields(self):
        response = self._post_adopt({"global_vehicle_id": str(self.global_vehicle.id)})
        self.assertEqual(response.status_code, 201, response.data)
        self.assertEqual(response.data["vin"], self.global_vehicle.vin)
        self.assertEqual(response.data["license_plate"], self.global_vehicle.license_plate)
        self.assertEqual(response.data["make"], "Ford")
        self.assertEqual(response.data["model"], "Focus")
        self.assertEqual(response.data["year"], 2018)
        self.assertEqual(response.data["odometer_km"], 120_000)

        connection.set_schema(self.tenant.schema_name)
        local = Vehicle.objects.get(id=response.data["id"])
        self.assertEqual(local.global_vehicle_id, self.global_vehicle.id)
        self.assertIsNone(local.owner)

    def test_adopt_is_idempotent(self):
        first = self._post_adopt({"global_vehicle_id": str(self.global_vehicle.id)})
        second = self._post_adopt({"global_vehicle_id": str(self.global_vehicle.id)})
        self.assertEqual(first.status_code, 201)
        self.assertEqual(second.status_code, 200)
        self.assertEqual(first.data["id"], second.data["id"])
        connection.set_schema(self.tenant.schema_name)
        self.assertEqual(
            Vehicle.objects.filter(global_vehicle_id=self.global_vehicle.id).count(),
            1,
        )

    def test_adopt_reconciles_legacy_local_vehicle_with_same_vin(self):
        connection.set_schema(self.tenant.schema_name)
        legacy = Vehicle.objects.create(
            vin=self.global_vehicle.vin,
            license_plate="LEGACY",
            make="Ford",
            model="Focus",
            year=2018,
        )
        connection.set_schema("public")
        self.assertIsNone(legacy.global_vehicle_id)

        response = self._post_adopt({"global_vehicle_id": str(self.global_vehicle.id)})
        self.assertEqual(response.status_code, 200)
        connection.set_schema(self.tenant.schema_name)
        legacy.refresh_from_db()
        self.assertEqual(legacy.global_vehicle_id, self.global_vehicle.id)
        self.assertEqual(response.data["id"], str(legacy.id))

    def test_adopt_does_not_duplicate_global_record(self):
        self._post_adopt({"global_vehicle_id": str(self.global_vehicle.id)})
        with public_schema():
            self.assertEqual(
                GlobalVehicle.objects.filter(vin=self.global_vehicle.vin).count(),
                1,
            )

    def test_adopt_returns_404_for_unknown_global_id(self):
        response = self._post_adopt(
            {"global_vehicle_id": "00000000-0000-0000-0000-000000000000"},
        )
        self.assertEqual(response.status_code, 404)

    def test_adopt_requires_global_id(self):
        response = self._post_adopt({})
        self.assertEqual(response.status_code, 400)
