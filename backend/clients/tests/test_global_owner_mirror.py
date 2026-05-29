from __future__ import annotations

from django.contrib.auth import get_user_model
from django.db import connection
from django.test import TestCase
from rest_framework.test import APIClient
from rest_framework_simplejwt.tokens import RefreshToken

from clients.models import Client
from clients.services import ensure_client_for_global_owner
from global_vehicles.models import GlobalOwner, GlobalVehicle, VehicleOwnership
from tenancy.models import WorkshopTenant
from tenancy.views import public_schema
from vehicles.models import Vehicle

User = get_user_model()


class GlobalOwnerClientMirrorTests(TestCase):
    """
    A vehicle that visits the workshop must surface its platform-wide owner
    as a client in this tenant's CRM (idempotently). The mirror persists
    even after the vehicle changes hands, so the workshop's address book
    still remembers the previous owner.
    """

    def setUp(self):
        self.tenant = WorkshopTenant.objects.create(
            name="Mirror Shop",
            schema_name="mirrorshop",
        )
        self.user = User.objects.create_user(
            username="mirror_user",
            password="testpass123",
            role=User.Role.ADMIN,
            tenant=self.tenant,
        )
        with public_schema():
            self.global_owner = GlobalOwner.objects.create(
                name="Arben Krasniqi",
                email="arben@example.com",
                phone="+38344000111",
            )
            self.global_vehicle = GlobalVehicle.objects.create(
                vin="WVWMIRROR000000AA",
                license_plate="MR-ARB-1",
                make="Audi",
                model="A4",
                year=2020,
            )
            VehicleOwnership.objects.create(
                vehicle=self.global_vehicle,
                owner=self.global_owner,
                license_plate=self.global_vehicle.license_plate,
            )
        connection.set_schema(self.tenant.schema_name)
        self.api = APIClient()
        token = RefreshToken.for_user(self.user).access_token
        self.api.credentials(HTTP_AUTHORIZATION=f"Bearer {token}")

    def tearDown(self):
        connection.set_schema("public")

    def test_helper_creates_local_client_from_global_owner(self):
        client = ensure_client_for_global_owner(self.global_owner)
        self.assertIsNotNone(client)
        self.assertEqual(client.global_owner_id, self.global_owner.id)
        self.assertEqual(client.name, "Arben Krasniqi")
        self.assertEqual(client.email, "arben@example.com")
        self.assertEqual(client.phone, "+38344000111")

    def test_helper_is_idempotent(self):
        first = ensure_client_for_global_owner(self.global_owner)
        second = ensure_client_for_global_owner(self.global_owner)
        self.assertEqual(first.id, second.id)
        self.assertEqual(Client.objects.filter(global_owner_id=self.global_owner.id).count(), 1)

    def test_helper_refreshes_local_client_from_global_changes(self):
        client = ensure_client_for_global_owner(self.global_owner)
        self.assertEqual(client.email, "arben@example.com")

        # Owner updates email at the platform level (e.g. via owner portal).
        with public_schema():
            self.global_owner.email = "arben.new@example.com"
            self.global_owner.save(update_fields=["email"])

        refreshed = ensure_client_for_global_owner(self.global_owner)
        self.assertEqual(refreshed.id, client.id)
        self.assertEqual(refreshed.email, "arben.new@example.com")

    def test_adopt_global_creates_client_and_links_owner(self):
        response = self.api.post(
            "/api/v1/vehicles/adopt-global/",
            {"global_vehicle_id": str(self.global_vehicle.id)},
            format="json",
        )
        self.assertEqual(response.status_code, 201, response.data)
        connection.set_schema(self.tenant.schema_name)
        local = Vehicle.objects.get(id=response.data["id"])
        self.assertIsNotNone(local.owner_id)
        self.assertEqual(local.owner.global_owner_id, self.global_owner.id)
        self.assertEqual(local.owner.name, "Arben Krasniqi")

    def test_visit_creation_lazy_mirrors_global_owner(self):
        # Workshop registered the local Vehicle directly (no adopt) and never
        # filled the owner. First visit should still surface the platform
        # owner as a client.
        connection.set_schema(self.tenant.schema_name)
        local = Vehicle.objects.create(
            vin=self.global_vehicle.vin,
            license_plate=self.global_vehicle.license_plate,
            make="Audi",
            model="A4",
            year=2020,
            global_vehicle_id=self.global_vehicle.id,
        )
        self.assertIsNone(local.owner_id)

        response = self.api.post(
            "/api/v1/visits/",
            {
                "vehicle_id": str(local.id),
                "mileage_km": 1000,
                "service_date": "2026-05-29T10:00:00Z",
                "status": "draft",
            },
            format="json",
        )
        self.assertEqual(response.status_code, 201, response.data)
        connection.set_schema(self.tenant.schema_name)
        local.refresh_from_db()
        self.assertIsNotNone(local.owner_id)
        self.assertEqual(local.owner.global_owner_id, self.global_owner.id)

        clients_response = self.api.get("/api/v1/clients/")
        self.assertEqual(clients_response.status_code, 200)
        body = clients_response.data
        items = body["results"] if isinstance(body, dict) and "results" in body else body
        names = [c["name"] for c in items]
        self.assertIn("Arben Krasniqi", names)

    def test_client_persists_after_ownership_transfer(self):
        first = ensure_client_for_global_owner(self.global_owner)
        client_id = first.id

        # Simulate ownership transfer at the platform level — close the
        # current ownership and open a new one to a different person.
        with public_schema():
            VehicleOwnership.objects.filter(
                vehicle=self.global_vehicle, effective_to__isnull=True,
            ).update(effective_to="2026-06-01")
            new_owner = GlobalOwner.objects.create(
                name="Blerta Hoxha",
                email="blerta@example.com",
            )
            VehicleOwnership.objects.create(
                vehicle=self.global_vehicle,
                owner=new_owner,
                license_plate="NEW-PLATE",
            )

        connection.set_schema(self.tenant.schema_name)
        # Old client row still in CRM — workshop's memory persists.
        self.assertTrue(Client.objects.filter(id=client_id).exists())
