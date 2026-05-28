from __future__ import annotations

from django.contrib.auth import get_user_model
from django.test import TestCase

from global_vehicles.models import GlobalOwner, GlobalVehicle, VehicleClaimToken, VehicleOwnership
from global_vehicles.services import (
    create_owner_claim_token,
    create_transfer_token,
    redeem_claim_token,
)

User = get_user_model()


class GlobalVehicleOwnershipTests(TestCase):
    def setUp(self):
        self.mechanic = User.objects.create_user(
            username="mech1",
            password="testpass123",
            role=User.Role.MECHANIC,
        )
        self.vehicle = GlobalVehicle.objects.create(
            vin="WVWZZZ1JZYW000001",
            license_plate="AA-001-AA",
            make="VW",
            model="Golf",
            year=2020,
        )
        self.owner_user = User.objects.create_user(
            username="owner1",
            email="owner@example.com",
            password="testpass123",
            role=User.Role.OWNER,
        )
        GlobalOwner.objects.create(
            user=self.owner_user,
            name="Owner One",
            email="owner@example.com",
        )

    def test_owner_claim_flow(self):
        token = create_owner_claim_token(
            vehicle=self.vehicle,
            created_by=self.mechanic,
            tenant=None,
        )
        ownership = redeem_claim_token(token_id=str(token.id), user=self.owner_user)
        self.assertEqual(ownership.vehicle_id, self.vehicle.id)
        self.assertEqual(ownership.license_plate, "AA-001-AA")
        self.assertIsNone(ownership.effective_to)
        token.refresh_from_db()
        self.assertIsNotNone(token.used_at)

    def test_transfer_requires_documents(self):
        create_owner_claim_token(
            vehicle=self.vehicle,
            created_by=self.mechanic,
            tenant=None,
        )
        redeem_claim_token(
            token_id=str(
                VehicleClaimToken.objects.filter(purpose=VehicleClaimToken.Purpose.OWNER_CLAIM).first().id,
            ),
            user=self.owner_user,
        )

        with self.assertRaises(Exception):
            create_transfer_token(
                vehicle=self.vehicle,
                created_by=self.mechanic,
                tenant=None,
                documents_verified=False,
                new_license_plate="BB-002-BB",
            )

    def test_transfer_to_new_owner(self):
        claim = create_owner_claim_token(
            vehicle=self.vehicle,
            created_by=self.mechanic,
            tenant=None,
        )
        redeem_claim_token(token_id=str(claim.id), user=self.owner_user)

        transfer = create_transfer_token(
            vehicle=self.vehicle,
            created_by=self.mechanic,
            tenant=None,
            documents_verified=True,
            new_license_plate="BB-002-BB",
        )

        new_owner_user = User.objects.create_user(
            username="owner2",
            email="owner2@example.com",
            password="testpass123",
            role=User.Role.OWNER,
        )
        GlobalOwner.objects.create(
            user=new_owner_user,
            name="Owner Two",
            email="owner2@example.com",
        )

        new_ownership = redeem_claim_token(token_id=str(transfer.id), user=new_owner_user)
        self.assertEqual(new_ownership.owner.email, "owner2@example.com")
        self.assertEqual(new_ownership.license_plate, "BB-002-BB")

        self.vehicle.refresh_from_db()
        self.assertEqual(self.vehicle.license_plate, "BB-002-BB")

        previous = VehicleOwnership.objects.filter(
            vehicle=self.vehicle,
            owner__email="owner@example.com",
        ).first()
        self.assertIsNotNone(previous.effective_to)
        self.assertEqual(previous.license_plate, "AA-001-AA")

    def test_update_registration_syncs_active_ownership(self):
        from global_vehicles.services import update_vehicle_registration

        claim = create_owner_claim_token(
            vehicle=self.vehicle,
            created_by=self.mechanic,
            tenant=None,
        )
        redeem_claim_token(token_id=str(claim.id), user=self.owner_user)

        update_vehicle_registration(vehicle=self.vehicle, license_plate="CC-003-CC")
        self.vehicle.refresh_from_db()
        active = VehicleOwnership.objects.get(vehicle=self.vehicle, effective_to__isnull=True)
        self.assertEqual(self.vehicle.license_plate, "CC-003-CC")
        self.assertEqual(active.license_plate, "CC-003-CC")
