from __future__ import annotations

from django.test import TestCase

from global_vehicles.models import GlobalVehicle


class GlobalVehicleModelTests(TestCase):
    def test_vin_is_unique(self):
        GlobalVehicle.objects.create(
            vin="WVWZZZ1JZYW000001",
            license_plate="AA-001-AA",
            make="VW",
            model="Golf",
            year=2020,
        )
        with self.assertRaises(Exception):
            GlobalVehicle.objects.create(
                vin="WVWZZZ1JZYW000001",
                license_plate="BB-002-BB",
                make="VW",
                model="Polo",
                year=2021,
            )

    def test_str_representation(self):
        vehicle = GlobalVehicle.objects.create(
            vin="WVWZZZ1JZYW000002",
            license_plate="CC-003-CC",
            make="Audi",
            model="A4",
            year=2019,
        )
        self.assertIn("CC-003-CC", str(vehicle))
        self.assertIn("Audi", str(vehicle))
