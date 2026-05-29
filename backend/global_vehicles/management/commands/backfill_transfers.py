"""
Backfill historical ownership-transfer rows.

Existing `VehicleOwnership` records (and their `VehicleClaimToken` parents)
predate the `OwnershipTransfer` lifecycle entity. This command walks the
history for every global vehicle and creates a synthetic `OwnershipTransfer`
row for each closed `transfer`-method ownership that has the matching claim
token, so the superadmin transfer ledger isn't blank on day one.

The synthetic rows:
  - inherit `claim_token` if the source ownership row points to one,
  - status = CONFIRMED,
  - confirmed_at = ownership.effective_from (best approximation),
  - notes mention `backfilled` so they're distinguishable from live data.
  - `TransferBilling` is created at fee_amount=0.00 / payment_status=waived
    because we never charged for them.

Safe to re-run: skips any ownership that already has a transfer record by
matching its `claim_token_id`.
"""
from __future__ import annotations

from decimal import Decimal

from django.core.management.base import BaseCommand
from django.db import transaction
from django_tenants.utils import schema_context

from global_vehicles.models import (
    OwnershipTransfer,
    TransferBilling,
    VehicleClaimToken,
    VehicleOwnership,
)


class Command(BaseCommand):
    help = "Backfill OwnershipTransfer + TransferBilling rows for pre-feature history."

    def add_arguments(self, parser):
        parser.add_argument(
            "--dry-run",
            action="store_true",
            help="Show what would be created without writing.",
        )

    def handle(self, *args, **options):
        dry = options["dry_run"]
        created = 0
        skipped = 0

        with schema_context("public"):
            # Closed transfer-method ownerships — these are the cases where
            # a transfer actually happened pre-feature. `qr_claim` first-time
            # claims and `reversal` rows are excluded.
            qs = (
                VehicleOwnership.objects.filter(
                    claim_method="transfer",
                    effective_to__isnull=False,
                )
                .select_related("vehicle", "owner")
                .order_by("effective_from")
            )

            for ownership in qs:
                # Find the originating claim token. Heuristic: the token whose
                # used_at is closest to ownership.effective_from and whose
                # purpose is ownership_transfer.
                claim_token = (
                    VehicleClaimToken.objects.filter(
                        vehicle=ownership.vehicle,
                        purpose=VehicleClaimToken.Purpose.OWNERSHIP_TRANSFER,
                        used_at__lte=ownership.effective_from + _DELTA,
                    )
                    .order_by("-used_at")
                    .first()
                )
                if claim_token is None:
                    skipped += 1
                    continue

                if OwnershipTransfer.objects.filter(claim_token=claim_token).exists():
                    skipped += 1
                    continue

                if dry:
                    self.stdout.write(
                        f"  would create transfer for {ownership.vehicle.license_plate} "
                        f"→ {ownership.owner.name} via token {claim_token.id}",
                    )
                    created += 1
                    continue

                self._create_transfer(ownership, claim_token)
                created += 1

        self.stdout.write(
            self.style.SUCCESS(
                f"Backfill complete — created {created} transfer(s), skipped {skipped}.",
            ),
        )

    @transaction.atomic
    def _create_transfer(self, ownership, claim_token):
        transfer = OwnershipTransfer.objects.create(
            vehicle=ownership.vehicle,
            from_owner=claim_token.from_owner,
            to_owner=ownership.owner,
            initiated_by_tenant=claim_token.created_by_tenant,
            initiated_by_user=claim_token.created_by,
            claim_token=claim_token,
            confirmed_at=ownership.effective_from,
            confirmed_by_user=claim_token.used_by,
            status=OwnershipTransfer.Status.CONFIRMED,
            documents_verified=claim_token.documents_verified,
            new_license_plate=claim_token.new_license_plate or "",
            initiator_notes=f"[backfilled] {claim_token.notes}",
        )
        TransferBilling.objects.create(
            transfer=transfer,
            fee_amount=Decimal("0.00"),
            fee_currency="EUR",
            payment_status=TransferBilling.PaymentStatus.WAIVED,
            snapshot={
                "kind": "transfer",
                "amount": "0.00",
                "currency": "EUR",
                "backfilled": True,
                "note": "Pre-feature ownership — no platform fee was charged.",
            },
        )


# Tolerance window for matching a closed ownership row to its claim token.
from datetime import timedelta  # noqa: E402

_DELTA = timedelta(minutes=5)
