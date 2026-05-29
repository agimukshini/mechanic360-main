"""
End-to-end coverage for the ownership-transfer lifecycle.

Each test wraps the entire flow (initiate → confirm / dispute → reverse)
and asserts both the transfer state machine AND the audit trail it leaves
behind. The audit log is the single source of truth for the superadmin so
we explicitly assert the events that should fire.
"""
from __future__ import annotations

from decimal import Decimal

from django.contrib.auth import get_user_model
from django.test import TestCase

from global_vehicles.models import (
    GlobalOwner,
    GlobalVehicle,
    OwnershipTransfer,
    TenantPlatformBilling,
    TransferBilling,
    VehicleAuditEvent,
    VehicleOwnership,
)
from global_vehicles.services import (
    create_owner_claim_token,
    redeem_claim_token,
)
from global_vehicles.transfer_services import (
    cancel_transfer,
    confirm_transfer,
    dispute_transfer,
    initiate_transfer,
    record_registration_charge,
    reverse_transfer,
    update_tenant_platform_billing,
)
from tenancy.models import WorkshopTenant

User = get_user_model()


class TransferLifecycleTests(TestCase):
    """Walk the full lifecycle: claim → transfer → confirm → reverse."""

    def setUp(self):
        # WorkshopTenant lives in public — we don't spin up real schemas in
        # tests, but a row exists so FK references work.
        self.tenant = WorkshopTenant.objects.create(
            name="Test Workshop",
            schema_name="test_workshop",
        )
        self.admin = User.objects.create_user(
            username="admin1",
            password="x",
            role=User.Role.ADMIN,
            tenant=self.tenant,
        )
        self.superadmin = User.objects.create_superuser(
            username="root",
            email="root@example.com",
            password="x",
        )
        self.vehicle = GlobalVehicle.objects.create(
            vin="WVWZZZ1JZYW999999",
            license_plate="AA-999-AA",
            make="VW",
            model="Polo",
            year=2019,
            registered_by_tenant=self.tenant,
        )

        # Initial owner via QR claim — sets the starting state.
        token = create_owner_claim_token(
            vehicle=self.vehicle,
            created_by=self.admin,
            tenant=self.tenant,
        )
        self.alice_user = User.objects.create_user(
            username="alice", password="x", role=User.Role.OWNER,
        )
        GlobalOwner.objects.create(user=self.alice_user, name="Alice", email="a@x")
        redeem_claim_token(token_id=str(token.id), user=self.alice_user)

        # Configure fees so initiate creates a non-zero billing row.
        billing = TenantPlatformBilling.for_tenant(self.tenant)
        billing.transfer_fee_amount = Decimal("9.99")
        billing.registration_fee_amount = Decimal("1.23")
        billing.save()

    def _new_owner_user(self, name="Bob") -> User:
        u = User.objects.create_user(
            username=name.lower(), password="x", role=User.Role.OWNER,
        )
        GlobalOwner.objects.create(user=u, name=name, email=f"{name.lower()}@x")
        return u

    def test_initiate_creates_pending_transfer_and_billing_snapshot(self):
        transfer = initiate_transfer(
            vehicle=self.vehicle,
            initiator=self.admin,
            tenant=self.tenant,
            new_license_plate="BB-111-BB",
            documents_verified=True,
            notes="Sold to Bob",
        )
        self.assertEqual(transfer.status, OwnershipTransfer.Status.PENDING)
        self.assertEqual(transfer.new_license_plate, "BB-111-BB")
        # Billing row exists with snapshot frozen to the tenant config.
        billing = transfer.billing
        self.assertEqual(billing.fee_amount, Decimal("9.99"))
        self.assertEqual(billing.snapshot["kind"], "transfer")
        # Audit: OWNERSHIP:transfer_initiated event captured actor + tenant.
        evt = VehicleAuditEvent.objects.get(
            entity=VehicleAuditEvent.Entity.OWNERSHIP,
            action=VehicleAuditEvent.Action.TRANSFER_INITIATED,
        )
        self.assertEqual(evt.actor_user_id, self.admin.id)
        self.assertEqual(evt.tenant_schema, self.tenant.schema_name)

    def test_confirm_creates_new_ownership_and_logs_plate_change(self):
        transfer = initiate_transfer(
            vehicle=self.vehicle,
            initiator=self.admin,
            tenant=self.tenant,
            new_license_plate="BB-222-BB",
            documents_verified=True,
            notes="",
        )
        bob = self._new_owner_user("Bob")
        confirm_transfer(transfer=transfer, user=bob)
        transfer.refresh_from_db()
        self.assertEqual(transfer.status, OwnershipTransfer.Status.CONFIRMED)

        active = VehicleOwnership.objects.get(
            vehicle=self.vehicle, effective_to__isnull=True,
        )
        self.assertEqual(active.owner.user_id, bob.id)
        self.vehicle.refresh_from_db()
        self.assertEqual(self.vehicle.license_plate, "BB-222-BB")
        self.assertTrue(
            VehicleAuditEvent.objects.filter(
                entity=VehicleAuditEvent.Entity.OWNERSHIP,
                action=VehicleAuditEvent.Action.TRANSFER_CONFIRMED,
            ).exists(),
        )

    def test_cancel_marks_transfer_cancelled_without_changing_ownership(self):
        transfer = initiate_transfer(
            vehicle=self.vehicle,
            initiator=self.admin,
            tenant=self.tenant,
            new_license_plate="ZZ-000-ZZ",
            documents_verified=True,
            notes="",
        )
        owner_before = (
            VehicleOwnership.objects.filter(
                vehicle=self.vehicle, effective_to__isnull=True,
            )
            .get()
            .owner_id
        )
        cancel_transfer(transfer=transfer, user=self.admin)
        transfer.refresh_from_db()
        self.assertEqual(transfer.status, OwnershipTransfer.Status.CANCELLED)
        owner_after = (
            VehicleOwnership.objects.filter(
                vehicle=self.vehicle, effective_to__isnull=True,
            )
            .get()
            .owner_id
        )
        self.assertEqual(owner_before, owner_after)

    def test_dispute_then_reverse_restores_previous_owner_and_plate(self):
        transfer = initiate_transfer(
            vehicle=self.vehicle,
            initiator=self.admin,
            tenant=self.tenant,
            new_license_plate="BB-333-BB",
            documents_verified=True,
            notes="",
        )
        bob = self._new_owner_user("Bob")
        confirm_transfer(transfer=transfer, user=bob)
        transfer.refresh_from_db()

        dispute_transfer(transfer=transfer, superadmin=self.superadmin, notes="Fraud")
        transfer.refresh_from_db()
        self.assertEqual(transfer.status, OwnershipTransfer.Status.DISPUTED)

        reverse_transfer(transfer=transfer, superadmin=self.superadmin, notes="Refund")
        transfer.refresh_from_db()
        self.assertEqual(transfer.status, OwnershipTransfer.Status.REVERSED)

        # Original owner (Alice) is active again, plate restored.
        active = VehicleOwnership.objects.get(
            vehicle=self.vehicle, effective_to__isnull=True,
        )
        self.assertEqual(active.owner.user_id, self.alice_user.id)
        self.vehicle.refresh_from_db()
        self.assertEqual(self.vehicle.license_plate, "AA-999-AA")
        # Reversal billing got waived.
        transfer.billing.refresh_from_db()
        self.assertEqual(transfer.billing.payment_status, TransferBilling.PaymentStatus.WAIVED)


class TenantBillingConfigTests(TestCase):
    """Per-tenant fee config — update audited + snapshots are frozen."""

    def setUp(self):
        self.tenant = WorkshopTenant.objects.create(
            name="Acme", schema_name="acme",
        )
        self.superadmin = User.objects.create_superuser(
            username="root2", email="r@x", password="x",
        )

    def test_for_tenant_creates_default_row(self):
        billing = TenantPlatformBilling.for_tenant(self.tenant)
        self.assertEqual(billing.transfer_fee_amount, Decimal("0.00"))
        self.assertEqual(billing.subscription_period, "none")

    def test_update_audits_each_changed_field(self):
        billing = TenantPlatformBilling.for_tenant(self.tenant)
        update_tenant_platform_billing(
            billing=billing,
            superadmin=self.superadmin,
            fields={
                "transfer_fee_amount": Decimal("5.00"),
                "registration_fee_amount": Decimal("2.00"),
                "subscription_period": "monthly",
            },
        )
        evt = VehicleAuditEvent.objects.filter(
            entity=VehicleAuditEvent.Entity.BILLING,
            action=VehicleAuditEvent.Action.BILLING_CHANGED,
            target_id=str(self.tenant.id),
        ).first()
        self.assertIsNotNone(evt)
        self.assertIn("transfer_fee_amount", evt.changes)
        self.assertIn("registration_fee_amount", evt.changes)


class RegistrationChargeTests(TestCase):
    """Vehicle-registration charge: idempotent, snapshots tenant fee."""

    def setUp(self):
        self.tenant = WorkshopTenant.objects.create(
            name="Charge Shop", schema_name="charge_shop",
        )
        self.user = User.objects.create_user(
            username="u", password="x", role=User.Role.MECHANIC, tenant=self.tenant,
        )
        billing = TenantPlatformBilling.for_tenant(self.tenant)
        billing.registration_fee_amount = Decimal("3.50")
        billing.save()
        self.vehicle = GlobalVehicle.objects.create(
            vin="WAUZZZ1JZ7W123456",
            license_plate="CC-111-CC",
            make="Audi", model="A4", year=2018,
            registered_by_tenant=self.tenant,
        )

    def test_first_charge_snapshots_fee_and_creates_billing_audit(self):
        charge = record_registration_charge(
            vehicle=self.vehicle, tenant=self.tenant, created_by=self.user,
        )
        self.assertEqual(charge.fee_amount, Decimal("3.50"))
        self.assertEqual(charge.snapshot["kind"], "registration")
        # Audit fired.
        self.assertTrue(
            VehicleAuditEvent.objects.filter(
                entity=VehicleAuditEvent.Entity.BILLING,
                action=VehicleAuditEvent.Action.BILLING_CHANGED,
                target_id=str(charge.id),
            ).exists(),
        )

    def test_second_call_returns_existing_charge(self):
        first = record_registration_charge(
            vehicle=self.vehicle, tenant=self.tenant, created_by=self.user,
        )
        second = record_registration_charge(
            vehicle=self.vehicle, tenant=self.tenant, created_by=self.user,
        )
        self.assertEqual(first.id, second.id)
