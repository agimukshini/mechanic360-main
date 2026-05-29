# Ownership Transfer, Billing, Audit & Fraud — Implementation Roadmap

Status: planned, not started.
Depends on: `VEHICLE_PHOTOS_ROADMAP.md` Phase A (shared `VehicleAuditEvent`).
Target: pick up after the photo gallery work.

## Goal

Turn the existing claim-token plumbing into a first-class ownership
transfer lifecycle with billing, full audit trails, and superadmin
tools to monitor history and investigate fraud / disputes.

## What already exists (do not rebuild)

- `global_vehicles.GlobalVehicle` — VIN as canonical ID.
- `global_vehicles.GlobalOwner` — principal user record.
- `global_vehicles.VehicleOwnership` — temporal owner table with
  `effective_from / effective_to`; already non-destructive history.
- `global_vehicles.VehicleClaimToken` — single-use QR token for owner
  claim and ownership transfer (already has `documents_verified`,
  `new_license_plate`, `expires_at`, `used_at / used_by`).
- `clients.Client` — tenant-local client record (the "local
  association").

What is missing
- A first-class `OwnershipTransfer` entity (today the workflow is
  implicit on the token + a row insert in `VehicleOwnership`).
- Transfer billing (fees, invoice references, payment status).
- Audit rows for every step — initiator, fee, QR confirmation, IP,
  device metadata.
- Superadmin views for transfer history and dispute investigation.

## Requirements (from user)

Logging
- Transfer initiator (workshop user that started the transfer).
- Previous owner.
- New owner.
- Timestamps for each step.
- Garage / mechanic.
- Fee charged.
- QR confirmation event.
- IP / device metadata where applicable.

Business rules
- Principal ownership always overrides local mechanic associations.
- Ownership history must never be deleted — append-only.
- Ownership transfers are incomplete until QR confirmation occurs.
- Mechanics may initiate transfers, manage local associations, upload
  documents. They may **not** force ownership change, override confirmed
  ownership, or modify transfer fees.

Superadmin features
- Monitor transfer history (cross-tenant).
- Investigate fraud / disputes.

## Data model

### `global_vehicles.OwnershipTransfer` (public schema)

The lifecycle entity. One row per transfer attempt — survives even if
the token expires unused, so disputes have a record.

```python
class OwnershipTransfer(models.Model):
    id = UUIDField(primary_key=True, default=uuid4)

    vehicle = ForeignKey(GlobalVehicle, related_name="transfers",
                         on_delete=PROTECT)

    from_owner = ForeignKey(GlobalOwner, null=True, blank=True,
                            related_name="outgoing_transfers",
                            on_delete=SET_NULL,
                            help_text="May be null for a first claim.")
    to_owner   = ForeignKey(GlobalOwner, null=True, blank=True,
                            related_name="incoming_transfers",
                            on_delete=SET_NULL,
                            help_text="Null until the QR is redeemed.")

    # Initiator
    initiated_by_tenant = ForeignKey("tenancy.WorkshopTenant",
                                     on_delete=PROTECT)
    initiated_by_user   = ForeignKey(User, on_delete=PROTECT)
    initiated_at        = DateTimeField(auto_now_add=True)
    initiated_ip        = GenericIPAddressField(null=True)
    initiated_user_agent= CharField(max_length=512, blank=True)

    # QR confirmation (mirrors VehicleClaimToken)
    claim_token         = OneToOneField(VehicleClaimToken,
                                        related_name="transfer",
                                        on_delete=PROTECT)
    confirmed_at        = DateTimeField(null=True, blank=True)
    confirmed_by_user   = ForeignKey(User, null=True, blank=True,
                                     related_name="confirmed_transfers",
                                     on_delete=SET_NULL)
    confirmed_ip        = GenericIPAddressField(null=True)
    confirmed_user_agent= CharField(max_length=512, blank=True)

    # Lifecycle
    class Status(TextChoices):
        PENDING        = "pending",        "Pending QR confirmation"
        CONFIRMED      = "confirmed",      "Confirmed"
        EXPIRED        = "expired",        "Expired before confirmation"
        CANCELLED      = "cancelled",      "Cancelled by initiator"
        DISPUTED       = "disputed",       "Disputed (frozen for review)"
        REVERSED       = "reversed",       "Reversed by superadmin"

    status = CharField(max_length=16, choices=Status.choices,
                       default=Status.PENDING, db_index=True)

    # Reason / notes — visible to superadmin only
    initiator_notes  = TextField(blank=True)
    superadmin_notes = TextField(blank=True,
                                 help_text="Filled when DISPUTED / REVERSED.")
    documents_verified = BooleanField(default=False)
    new_license_plate  = CharField(max_length=32, blank=True)

    class Meta:
        ordering = ["-initiated_at"]
        indexes = [
            Index(fields=["vehicle", "-initiated_at"]),
            Index(fields=["from_owner", "to_owner"]),
            Index(fields=["status", "initiated_at"]),
        ]
```

### `global_vehicles.TransferBilling` (public schema)

One row per transfer — fee captured at initiation time, payment status
tracked separately. Mechanics cannot modify these fields (enforced at
serializer level).

```python
class TransferBilling(models.Model):
    id = UUIDField(primary_key=True, default=uuid4)
    transfer = OneToOneField(OwnershipTransfer, related_name="billing",
                             on_delete=PROTECT)

    fee_amount   = DecimalField(max_digits=10, decimal_places=2)
    fee_currency = CharField(max_length=3, default="EUR")

    class PaymentStatus(TextChoices):
        UNPAID    = "unpaid",    "Unpaid"
        PROCESSING= "processing","Processing"
        PAID      = "paid",      "Paid"
        REFUNDED  = "refunded",  "Refunded"
        WAIVED    = "waived",    "Waived"  # superadmin only

    payment_status = CharField(max_length=16,
                               choices=PaymentStatus.choices,
                               default=PaymentStatus.UNPAID)

    invoice_reference = CharField(max_length=64, blank=True)
    paid_at           = DateTimeField(null=True, blank=True)
    captured_by       = ForeignKey(User, null=True, blank=True,
                                   on_delete=SET_NULL,
                                   related_name="captured_transfer_fees")

    # Frozen audit copy of the price list at the time of charging,
    # so historical fees survive a price-list change.
    snapshot = JSONField(default=dict, blank=True)

    created_at = DateTimeField(auto_now_add=True)
    updated_at = DateTimeField(auto_now=True)
```

### Reuse `VehicleAuditEvent` from the photos roadmap

Add three new actions to the existing `Action` enum:
- `TRANSFER_INITIATED`
- `TRANSFER_CONFIRMED`
- `TRANSFER_DISPUTED`
- `TRANSFER_REVERSED`
- `BILLING_CHANGED` (fee status moves: unpaid → paid, etc.)

Every transfer step writes a `VehicleAuditEvent` with `entity =
OWNERSHIP`, `target_id = transfer.id` and a JSON diff. Result: the same
superadmin endpoint sees ownership transfers alongside vehicle CRUD and
photo CRUD.

### Local mechanic association

The user spec calls out "Local Client Association" with garage, mechanic,
client, service context, association date. We already have this — it's
`clients.Client` (tenant-local) + `Vehicle.owner` (FK to Client) +
`Vehicle.assigned_mechanic`. Acceptance criteria below assert that local
associations stay intact when a principal ownership transfer happens
(they continue to point at the same `Client` row; principal ownership
is a separate global-schema concept that overrides for billing /
reports).

## Permissions

```python
class IsTransferInitiator(BasePermission):
    """Workshop mechanic or admin."""

class IsTransferConfirmer(BasePermission):
    """Authenticated owner (principal user)."""

class IsTransferSuperviser(BasePermission):
    """Platform superadmin only — dispute / reverse / waive fee."""
```

Hard rules enforced at the serializer:
- Mechanics cannot edit `fee_amount`, `payment_status`,
  `superadmin_notes`, `status` (after creation).
- Mechanics cannot create a transfer if the vehicle has an unresolved
  `DISPUTED` transfer.
- Confirmation must come from the *target* owner's authenticated session
  (matches `to_owner.user`).

## API surface

Workshop side
| Method | Path                                              | Who         |
| ------ | ------------------------------------------------- | ----------- |
| POST   | `/api/v1/vehicles/<id>/transfer/`                 | mechanic    |
| GET    | `/api/v1/vehicles/<id>/transfers/`                | tenant user |
| POST   | `/api/v1/vehicles/<id>/transfers/<tid>/cancel/`   | initiator   |

Owner side (confirmation)
| POST   | `/api/v1/owner/transfers/<tid>/confirm/`          | target owner|
| GET    | `/api/v1/owner/transfers/`                        | owner       |

Superadmin
| GET    | `/api/v1/tenants/transfers/`                      | superadmin  |
| GET    | `/api/v1/tenants/transfers/<tid>/`                | superadmin  |
| POST   | `/api/v1/tenants/transfers/<tid>/dispute/`        | superadmin  |
| POST   | `/api/v1/tenants/transfers/<tid>/reverse/`        | superadmin  |
| PATCH  | `/api/v1/tenants/transfers/<tid>/billing/`        | superadmin  |

Filters on the superadmin list: `tenant_schema, status, vehicle,
from_owner, to_owner, date_from, date_to, payment_status, has_dispute`.

## IP / device metadata capture

Centralise in a single helper:

```python
def request_actor_context(request) -> dict:
    return {
        "ip":         get_client_ip(request),
        "user_agent": request.META.get("HTTP_USER_AGENT", "")[:512],
        "actor_id":   getattr(request.user, "id", None),
        "tenant":     getattr(request.user, "tenant", None),
    }
```

Use at every transfer endpoint and pass into `log_vehicle_event`.

## Frontend

Workshop (mechanic / admin)
- New section on `VehicleDetail.tsx` → "Ownership" panel with:
  - current principal owner + history list (already shown today),
  - "Start ownership transfer" button (opens modal: new plate,
    documents-verified checkbox, fee preview, notes).
  - On submit → QR + claim URL displayed, pending transfer row appears
    in the history with status `pending` and a "Cancel" button.

Owner portal
- `OwnerVehicleDetail.tsx` → "Pending transfers awaiting your
  confirmation" alert at the top; tapping QR or claim URL opens the
  confirmation page that summarises: from, to, fee, garage, plate.
  Confirm → green check; cancel → red.

Superadmin
- New page `pages/admin/AdminTransfersPage.tsx` — table of all
  transfers with filters (date range, status, tenant, vehicle, owner).
  Row expand shows full audit trail (events from
  `VehicleAuditEvent`), billing block, and a "Mark disputed" /
  "Reverse" / "Waive fee" action set.
- Reuse the shared `AdminVehicleAuditPage` for the per-vehicle drilldown.

## Implementation order

Phase A — Foundation
1. `OwnershipTransfer` + `TransferBilling` models + migrations.
2. Backfill: for each existing `VehicleOwnership` row that has
   `claim_method != ""`, synthesise an `OwnershipTransfer` row with
   `status=CONFIRMED` so history is uniform.
3. Extend `VehicleAuditEvent.Action` with the four transfer actions.
4. `request_actor_context` helper.

Phase B — Workshop & owner endpoints
5. POST `vehicles/<id>/transfer/` — creates transfer + claim token +
   billing row in one transaction, returns QR.
6. POST `owner/transfers/<tid>/confirm/` — atomically closes the
   previous `VehicleOwnership` row, opens a new one, marks transfer
   `CONFIRMED`, fires audit events.
7. POST `vehicles/<id>/transfers/<tid>/cancel/` — initiator only,
   while `status == PENDING`.

Phase C — Superadmin tooling
8. `/tenants/transfers/` list endpoint with filters.
9. Dispute / reverse / waive endpoints with strict permissions and
   mandatory `superadmin_notes`.
10. Reverse logic: never delete history; instead append a new
    `OwnershipTransfer` with `status=REVERSED` pointing to the original.

Phase D — Frontend
11. Workshop "Start transfer" modal.
12. Owner confirmation page.
13. Superadmin transfers page.

Phase E — Tests
14. `tests/test_transfer_lifecycle.py` — happy path, expiry,
    cancellation, double-confirm prevented.
15. `tests/test_transfer_permissions.py` — mechanic cannot edit fee,
    owner cannot confirm someone else's transfer, superadmin can.
16. `tests/test_transfer_audit.py` — every state change emits exactly
    one audit row, with IP + UA captured.
17. `tests/test_transfer_billing.py` — fee snapshot frozen at
    creation, status transitions guarded.

## Anti-patterns to enforce

- Never mutate `OwnershipTransfer.fee_amount` after creation. New fee
  → new transfer row.
- Never delete `VehicleOwnership` rows. Always close them with
  `effective_to` and open a new row.
- Never let a mechanic write `superadmin_notes` or `payment_status`.
  Enforce both in DRF serializer `read_only_fields` *and* in a
  ViewSet-level guard.
- Confirmation endpoint must be idempotent — second call returns the
  same transfer state, never double-applies.

## Acceptance checklist

- [ ] Mechanic starts a transfer → row visible in workshop +
      superadmin views with status `pending`.
- [ ] Owner confirms via QR → status moves to `confirmed`, previous
      `VehicleOwnership` closed, new row opened, audit chain captures
      every step incl. IP + UA.
- [ ] Mechanic cannot edit fee or status after creation (403).
- [ ] Owner cannot confirm a transfer addressed to a different owner
      (403).
- [ ] Expired tokens move to `expired` automatically via celery.
- [ ] Superadmin can mark a confirmed transfer disputed; downstream
      vehicle actions are blocked while disputed.
- [ ] Superadmin reverse creates a new transfer row, never deletes
      history.
- [ ] Cross-tenant `/tenants/transfers/` returns transfers from every
      schema in one query and filters by status / date / tenant.
- [ ] Every step appears in `/tenants/vehicle-audit/` with the right
      `entity = OWNERSHIP` and a JSON diff.
