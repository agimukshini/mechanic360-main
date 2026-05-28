from __future__ import annotations

from django.contrib.auth import get_user_model
from django.db import connection
from django.test import TestCase

from clients.models import Client
from global_vehicles.models import GlobalVehicle
from tenancy.models import WorkshopTenant
from tenancy.views import public_schema
from vehicles.global_sync import sync_vehicle_to_global
from vehicles.models import Vehicle

User = get_user_model()


class VehicleGlobalSyncTests(TestCase):
    def setUp(self):
        self.tenant = WorkshopTenant.objects.create(
            name="Test Shop",
            schema_name="testshop",
        )
        self.user = User.objects.create_user(
            username="shopuser",
            password="testpass123",
            role=User.Role.MECHANIC,
            tenant=self.tenant,
        )
        connection.set_schema(self.tenant.schema_name)
        self.client_record = Client.objects.create(
            name="John Doe",
            type=Client.INDIVIDUAL,
        )

    def tearDown(self):
        connection.set_schema("public")

    def test_sync_creates_global_vehicle(self):
        vehicle = Vehicle.objects.create(
            owner=self.client_record,
            vin="WVWZZZ1JZYW000099",
            license_plate="AA-100-AA",
            make="VW",
            model="Golf",
            year=2020,
        )
        sync_vehicle_to_global(vehicle=vehicle, user=self.user, tenant=self.tenant)
        vehicle.refresh_from_db()
        self.assertIsNotNone(vehicle.global_vehicle_id)

        with public_schema():
            global_vehicle = GlobalVehicle.objects.get(id=vehicle.global_vehicle_id)
        self.assertEqual(global_vehicle.vin, "WVWZZZ1JZYW000099")
        self.assertEqual(global_vehicle.license_plate, "AA-100-AA")

    def test_sync_links_existing_global_vin(self):
        with public_schema():
            GlobalVehicle.objects.create(
                vin="WVWZZZ1JZYW000088",
                license_plate="OLD-PLATE",
                make="Audi",
                model="A3",
                year=2018,
            )

        vehicle = Vehicle.objects.create(
            owner=self.client_record,
            vin="WVWZZZ1JZYW000088",
            license_plate="NEW-PLATE",
            make="Audi",
            model="A3",
            year=2018,
        )
        sync_vehicle_to_global(vehicle=vehicle, user=self.user, tenant=self.tenant)
        vehicle.refresh_from_db()

        with public_schema():
            global_vehicle = GlobalVehicle.objects.get(vin="WVWZZZ1JZYW000088")
        self.assertEqual(str(vehicle.global_vehicle_id), str(global_vehicle.id))
        self.assertEqual(global_vehicle.license_plate, "NEW-PLATE")
