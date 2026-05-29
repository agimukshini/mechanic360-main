"""
Completing a visit must propagate the latest odometer / hour meter to the
public GlobalVehicle row so the owner portal and any other workshop see
the freshest reading. Per VEHICLE_SHARING_POLICY.md §4.2.
"""
from __future__ import annotations

from django.contrib.auth import get_user_model
from django.db import connection
from django.test import TestCase
from rest_framework.test import APIClient
from rest_framework_simplejwt.tokens import RefreshToken

from clients.models import Client
from global_vehicles.models import GlobalVehicle
from tenancy.models import WorkshopTenant
from tenancy.views import public_schema
from vehicles.global_sync import sync_vehicle_to_global
from vehicles.models import ServiceVisit, Vehicle

User = get_user_model()


class GlobalOdometerSyncTests(TestCase):
    def setUp(self):
        self.tenant = WorkshopTenant.objects.create(
            name="Mileage Shop",
            schema_name="mileageshop",
        )
        self.user = User.objects.create_user(
            username="mileage_user",
            password="testpass123",
            role=User.Role.ADMIN,
            tenant=self.tenant,
        )
        connection.set_schema(self.tenant.schema_name)
        self.client_record = Client.objects.create(
            name="Owner",
            type=Client.INDIVIDUAL,
        )
        self.vehicle = Vehicle.objects.create(
            owner=self.client_record,
            vin="WVWMILEAGE1234567",
            license_plate="OD-001",
            make="Skoda",
            model="Octavia",
            year=2018,
            odometer_km=50_000,
        )
        sync_vehicle_to_global(vehicle=self.vehicle, user=self.user, tenant=self.tenant)
        self.vehicle.refresh_from_db()
        self.api = APIClient()
        token = RefreshToken.for_user(self.user).access_token
        self.api.credentials(HTTP_AUTHORIZATION=f"Bearer {token}")

    def tearDown(self):
        connection.set_schema("public")

    def _get_global_km(self):
        with public_schema():
            return GlobalVehicle.objects.get(id=self.vehicle.global_vehicle_id).odometer_km

    def test_finishing_visit_pushes_latest_km_to_global_vehicle(self):
        self.assertEqual(self._get_global_km(), 50_000)

        connection.set_schema(self.tenant.schema_name)
        visit = ServiceVisit.objects.create(
            vehicle=self.vehicle,
            client=self.client_record,
            mileage_km=51_500,
            status=ServiceVisit.Status.IN_PROGRESS,
        )
        # Inspection isn't required to finish a visit, but the helper allows
        # passing mileage at finish time too — exercise that path.
        response = self.api.post(
            f"/api/v1/visits/{visit.id}/finish/",
            {"mileage_km": 51_500},
            format="json",
        )
        self.assertEqual(response.status_code, 200, response.data)
        self.assertEqual(self._get_global_km(), 51_500)

    def test_global_odometer_never_goes_backwards(self):
        connection.set_schema(self.tenant.schema_name)
        first = ServiceVisit.objects.create(
            vehicle=self.vehicle,
            mileage_km=60_000,
            status=ServiceVisit.Status.IN_PROGRESS,
        )
        self.api.post(f"/api/v1/visits/{first.id}/finish/", {"mileage_km": 60_000}, format="json")
        self.assertEqual(self._get_global_km(), 60_000)

        # Stale visit with a lower reading must not regress the global value.
        connection.set_schema(self.tenant.schema_name)
        late = ServiceVisit.objects.create(
            vehicle=self.vehicle,
            mileage_km=58_000,
            status=ServiceVisit.Status.IN_PROGRESS,
        )
        self.api.post(f"/api/v1/visits/{late.id}/finish/", {"mileage_km": 58_000}, format="json")
        self.assertEqual(self._get_global_km(), 60_000)
