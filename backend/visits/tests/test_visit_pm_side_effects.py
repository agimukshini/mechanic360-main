"""Tests for check-in owner alerts and PM auto-close on visit completion."""
from __future__ import annotations

from django.contrib.auth import get_user_model
from django.db import connection
from django.test import TestCase
from django.utils import timezone
from rest_framework.test import APIClient
from rest_framework_simplejwt.tokens import RefreshToken

from accounts.notifications import Notification
from global_vehicles.models import GlobalOwner, GlobalVehicle, PreventiveMaintenanceOrder, VehicleOwnership
from global_vehicles.pm_kinds import PMKind
from global_vehicles.pm_services import upsert_open_pm_order
from tenancy.models import WorkshopTenant
from tenancy.views import public_schema
from vehicles.models import ServiceVisit, Vehicle
from visits.models import PreventiveMaintenancePlan, ServiceCatalogItem, VisitServiceLine

User = get_user_model()


class VisitPmSideEffectsTests(TestCase):
    def setUp(self):
        self.tenant = WorkshopTenant.objects.create(
            schema_name="pmfx",
            name="PM Fix Shop",
            language="en",
            currency="EUR",
        )
        self.admin = User.objects.create_user(
            username="pmfx_admin",
            email="pmfx_admin@test.com",
            password="pass12345",
            role=User.Role.ADMIN,
            tenant=self.tenant,
        )
        self.owner_user = User.objects.create_user(
            username="pmfx_owner",
            email="owner_pmfx@test.com",
            password="pass12345",
            role=User.Role.OWNER,
        )

        with public_schema():
            self.global_vehicle = GlobalVehicle.objects.create(
                vin="PMFXVIN000001",
                license_plate="PM-FX-01",
                make="VW",
                model="Golf",
                year=2019,
            )
            self.global_owner = GlobalOwner.objects.create(
                user=self.owner_user,
                name="Principal Owner",
                email="owner_pmfx@test.com",
            )
            VehicleOwnership.objects.create(
                vehicle=self.global_vehicle,
                owner=self.global_owner,
                license_plate=self.global_vehicle.license_plate,
            )
            upsert_open_pm_order(
                global_vehicle_id=self.global_vehicle.id,
                pm_kind=PMKind.REGULAR,
                due_odometer_km=100_000,
                created_by_tenant=self.tenant,
            )

        connection.set_schema(self.tenant.schema_name)
        self.catalog = ServiceCatalogItem.objects.create(
            name="Oil Change Side Effect Test",
            pm_kind=PMKind.REGULAR,
            is_active=True,
            default_price=45,
        )
        self.local_vehicle = Vehicle.objects.create(
            global_vehicle_id=self.global_vehicle.id,
            vin=self.global_vehicle.vin,
            license_plate=self.global_vehicle.license_plate,
            make=self.global_vehicle.make,
            model=self.global_vehicle.model,
            year=self.global_vehicle.year,
            odometer_km=102_500,
        )
        PreventiveMaintenancePlan.objects.create(
            vehicle=self.local_vehicle,
            name="Regular service",
            pm_kind=PMKind.REGULAR,
            interval_km=10_000,
            last_mileage_km=90_000,
        )

        self.api = APIClient()
        token = RefreshToken.for_user(self.admin).access_token
        self.api.credentials(HTTP_AUTHORIZATION=f"Bearer {token}")

    def tearDown(self):
        connection.set_schema("public")

    def test_check_in_notifies_principal_owner(self):
        response = self.api.post(
            "/api/v1/visits/",
            {
                "vehicle_id": str(self.local_vehicle.id),
                "mileage_km": 102_500,
                "service_date": timezone.now().isoformat(),
                "notes": "",
            },
            format="json",
        )
        self.assertEqual(response.status_code, 201, response.data)
        self.assertTrue(
            Notification.objects.filter(
                user=self.owner_user,
                title__icontains="checked in",
            ).exists(),
        )

    def test_finish_visit_closes_pm_order(self):
        visit = ServiceVisit.objects.create(
            vehicle=self.local_vehicle,
            mileage_km=102_500,
            service_date=timezone.now(),
            status=ServiceVisit.Status.DRAFT,
            created_by=self.admin,
        )
        VisitServiceLine.objects.create(
            visit=visit,
            catalog_item=self.catalog,
            description="Oil change",
            quantity=1,
            unit_price=45,
            total_price=45,
        )

        response = self.api.post(
            f"/api/v1/visits/{visit.id}/finish/",
            {"mileage_km": 102_500},
            format="json",
        )
        self.assertEqual(response.status_code, 200, response.data)

        with public_schema():
            order = PreventiveMaintenanceOrder.objects.get(
                global_vehicle=self.global_vehicle,
                pm_kind=PMKind.REGULAR,
            )
            self.assertEqual(order.status, PreventiveMaintenanceOrder.Status.COMPLETED)

        connection.set_schema(self.tenant.schema_name)
        plan = PreventiveMaintenancePlan.objects.get(vehicle=self.local_vehicle)
        self.assertEqual(plan.last_mileage_km, 102_500)
