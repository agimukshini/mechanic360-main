# Vehicle Gallery + Full Vehicle Audit Log — Implementation Roadmap

Status: **implemented** (2026-05). Acceptance checklist below is for QA sign-off — do not treat as “not started”.
Owner: TBD.
Target: maintenance / QA only.

## Goal

Two related deliverables, sharing a single cross-tenant audit framework:

1. Replace the single `Vehicle.photo` field with a proper photo gallery
   with mechanic-restricted CRUD.
2. Record every vehicle-side change (create / update / delete / ownership
   transfer / photo CRUD) in a cross-tenant audit log visible only to the
   platform superadmin.

## Requirements (from user)

Photo gallery
1. Multiple photos per vehicle (today: only one).
2. Full CRUD: add, edit (caption / replace), remove.
3. Add / remove permitted only to workshop mechanics & admins.

Vehicle audit log
4. Every vehicle create / update / delete logged.
5. Every ownership transfer logged (current `transfer_qr`, `registration`
   patch, and any `owner` change).
6. Every photo add / edit / delete logged.
7. Per workshop, per vehicle.
8. Visible to the platform superadmin only.

## Data model

### Tenant schema — `vehicles.VehiclePhoto`

```python
class VehiclePhoto(models.Model):
    id = UUIDField(primary_key=True, default=uuid4)
    vehicle = ForeignKey(Vehicle, related_name="photos", on_delete=CASCADE)
    image = ImageField(upload_to="vehicle_photos/")
    caption = CharField(max_length=255, blank=True)
    position = PositiveSmallIntegerField(default=0)   # display order
    is_primary = BooleanField(default=False)          # legacy hero photo
    uploaded_by = ForeignKey(User, null=True, on_delete=SET_NULL)
    uploaded_at = DateTimeField(auto_now_add=True)
    updated_at  = DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-is_primary", "position", "uploaded_at"]
```

Notes
- One photo per vehicle stays `is_primary=True`; that's the one shown in
  list views / hero card / door-sticker (keeps existing UI working with
  zero changes elsewhere).
- Do **not** drop `Vehicle.photo` immediately. Migration plan below
  converts existing rows; we keep the column for two releases for safety,
  then remove.

### Public schema — `global_vehicles.VehicleAuditEvent`

One generic cross-tenant audit table covers everything: vehicle CRUD,
ownership transfers, and photo CRUD. Lives in the public schema so the
superadmin can query once and see every workshop.

```python
class VehicleAuditEvent(models.Model):
    id = UUIDField(primary_key=True, default=uuid4)

    # --- Cross-tenant pointers (no FK — tenant rows live elsewhere) ----
    tenant_schema     = CharField(max_length=63, db_index=True)
    tenant_name       = CharField(max_length=255, blank=True)
    vehicle_tenant_id = UUIDField(db_index=True)
    global_vehicle_id = UUIDField(null=True, db_index=True)

    # --- What kind of change happened ----------------------------------
    class Entity(TextChoices):
        VEHICLE          = "vehicle"            # create / update / delete
        OWNERSHIP        = "ownership"          # owner change, transfer, claim
        REGISTRATION     = "registration"      # plate change
        PHOTO            = "photo"              # gallery CRUD
        ASSIGNMENT       = "assignment"         # assigned_mechanic change
        ARCHIVE          = "archive"            # is_active toggle

    class Action(TextChoices):
        CREATED   = "created"
        UPDATED   = "updated"
        DELETED   = "deleted"
        ARCHIVED  = "archived"
        RESTORED  = "restored"
        TRANSFERRED = "transferred"             # ownership
        CLAIMED   = "claimed"                   # owner QR redeem

    entity = CharField(max_length=16, choices=Entity.choices, db_index=True)
    action = CharField(max_length=16, choices=Action.choices, db_index=True)

    # Optional pointer to the *sub-entity* row when relevant
    # (e.g. photo_id, ownership_id). Keep as plain UUID/CharField — these
    # also live in other schemas.
    target_id = CharField(max_length=64, blank=True, db_index=True)

    # --- Actor ----------------------------------------------------------
    actor_user_id   = UUIDField(null=True)
    actor_username  = CharField(max_length=150, blank=True)
    actor_role      = CharField(max_length=32, blank=True)
    request_ip      = GenericIPAddressField(null=True)

    # --- Diff -----------------------------------------------------------
    # JSON map of {field: {"before": ..., "after": ...}}. Per-entity what
    # we record:
    #   vehicle:      vin, license_plate, make, model, year, description,
    #                 odometer_km, hour_meter, is_active, assigned_mechanic
    #   ownership:    owner_id, owner_name, source ("local"|"global")
    #   registration: license_plate, plate_before
    #   photo:        caption, position, is_primary, image_path
    #   archive:      is_active
    changes = JSONField(default=dict, blank=True)

    # Free-form note for actions that have no obvious diff
    # (e.g. "transferred via QR token <id>").
    note = CharField(max_length=512, blank=True)

    occurred_at = DateTimeField(auto_now_add=True, db_index=True)

    class Meta:
        ordering = ["-occurred_at"]
        indexes = [
            Index(fields=["tenant_schema", "vehicle_tenant_id"]),
            Index(fields=["global_vehicle_id", "occurred_at"]),
            Index(fields=["entity", "action"]),
        ]
```

### Audit helper

`global_vehicles/audit.py`:

```python
def log_vehicle_event(
    *,
    entity: VehicleAuditEvent.Entity,
    action: VehicleAuditEvent.Action,
    vehicle,
    request=None,
    target_id: str = "",
    changes: dict | None = None,
    note: str = "",
) -> None:
    """Write one VehicleAuditEvent in the public schema.

    Caller is in the tenant schema; we wrap in schema_context('public')
    so this is the only line site code needs.
    """
```

Call sites
- `VehicleSerializer.create / update` → diff before/after; emit
  `VEHICLE / created | updated` (with `is_active` toggle becoming
  `ARCHIVE / archived | restored` when that's the only change).
- `VehicleViewSet.destroy` → `VEHICLE / deleted`.
- `VehicleViewSet.registration` → `REGISTRATION / updated`.
- `VehicleViewSet.transfer_qr` (when the redeeming side actually
  changes the owner) → `OWNERSHIP / transferred` with `target_id =
  token_id`.
- `owner_claim_qr` + `OwnerClaimView` → `OWNERSHIP / claimed`.
- `Vehicle.owner` change in serializer update → `OWNERSHIP / updated`.
- `assigned_mechanic` change → `ASSIGNMENT / updated`.
- Photo viewset → `PHOTO / created | updated | deleted`.

To avoid noise, the helper compares before/after and silently
short-circuits when `changes` is empty (i.e. someone re-saved with no
real change).

## Permissions

Reuse what already exists:

```python
# accepts: workshop admin + mechanic
class IsWorkshopStaffForWrite(BasePermission):
    SAFE = ("GET", "HEAD", "OPTIONS")
    def has_permission(self, request, view):
        if request.method in self.SAFE:
            return request.user.is_authenticated
        return request.user.is_authenticated and request.user.role in {
            User.Role.ADMIN, User.Role.MECHANIC,
        }
```

Read access: any authenticated tenant user, plus the vehicle owner via
the owner portal (already lists vehicles by ownership).

Superadmin audit endpoint: `IsSuperAdmin` (already exists in
`mechanic360/permissions.py`).

## API surface

Nested under `vehicles/<id>/photos/`:

| Method | Path                                          | Who           |
| ------ | --------------------------------------------- | ------------- |
| GET    | `/api/v1/vehicles/<id>/photos/`               | tenant user   |
| POST   | `/api/v1/vehicles/<id>/photos/` (multipart)   | mechanic/admin|
| PATCH  | `/api/v1/vehicles/<id>/photos/<photo_id>/`    | mechanic/admin|
| DELETE | `/api/v1/vehicles/<id>/photos/<photo_id>/`    | mechanic/admin|
| POST   | `/api/v1/vehicles/<id>/photos/<photo_id>/set-primary/` | mechanic/admin |

Owner side (read-only):
| GET    | `/api/v1/owner/vehicles/<gv_id>/photos/`      | owner only    |

Superadmin (cross-tenant, single endpoint for *all* vehicle audit):
| GET    | `/api/v1/tenants/vehicle-audit/`              | superadmin    |
|        | filters: `tenant_schema`, `vehicle_tenant_id`, `global_vehicle_id`, `entity`, `action`, `actor_user_id`, `date_from`, `date_to`, pagination, `ordering=-occurred_at` |

Convenience: `?entity=photo` gives the previous "photo-only" view, but
the same endpoint covers vehicle CRUD, registration, transfers, etc.

## Implementation order

### Phase A — Audit foundation (do first, blocks everything else)

1. **`VehicleAuditEvent` model + migration** in `global_vehicles`
   (public schema only — confirm it's in `SHARED_APPS`).
2. **`log_vehicle_event` helper** in `global_vehicles/audit.py`,
   inside `schema_context("public")`.
3. **Diff utility** for `Vehicle` model instances —
   `vehicle_diff(old: Vehicle, new: Vehicle, fields=[…])` returning the
   `changes` dict used by the helper. Reuse for photo / ownership.
4. **Superadmin endpoint** `/tenants/vehicle-audit/` with the filter set.

### Phase B — Wire existing vehicle CRUD to the audit log

5. `VehicleSerializer.create` → audit `VEHICLE / created`.
6. `VehicleSerializer.update` → diff, then:
   - If only `is_active` changed → `ARCHIVE / archived|restored`.
   - If only `assigned_mechanic` changed → `ASSIGNMENT / updated`.
   - If `owner_id` changed → `OWNERSHIP / updated`.
   - Otherwise → `VEHICLE / updated` (with the full diff).
7. `VehicleViewSet.destroy` → `VEHICLE / deleted`.
8. `VehicleViewSet.registration` → `REGISTRATION / updated`.
9. `transfer_qr` redeem (in `global_vehicles.services.redeem_*`) →
   `OWNERSHIP / transferred`.
10. `OwnerClaimView.post` → `OWNERSHIP / claimed`.

### Phase C — Photo gallery (depends on audit foundation)

11. **`VehiclePhoto` model + migration** (`vehicles/migrations/0009_…`).
12. **Data migration**: every existing `Vehicle.photo` becomes one
    `VehiclePhoto` row with `is_primary=True`, plus one audit row
    `PHOTO / created` attributed to `actor_username="system-migration"`.
13. **Serializer + ViewSet + URL** in `vehicles/` (nested under
    `vehicles/<id>/photos/`).
14. **Permission class** `IsWorkshopStaffForWrite` (read = any tenant
    user; write = admin/mechanic).
15. Wire photo CRUD to `log_vehicle_event(entity=PHOTO, …)`.
16. Owner-portal read endpoint:
    `GET /owner/vehicles/<gv_id>/photos/`.

### Phase D — Frontend

17. **`VehiclePhotoGallery` component** on `VehicleDetail.tsx`:
    grid (2/3/4 cols by breakpoint), lightbox, per-photo edit caption
    + delete for mechanics, "set as primary" action.
18. **`VehicleForm.tsx`** — keep single hero upload for vehicle
    creation; multi-add lives on the detail page.
19. Owner-portal gallery on `OwnerVehicleDetail.tsx` (read-only).
20. **`pages/admin/AdminVehicleAuditPage.tsx`** — one page handles
    everything (vehicle CRUD + photos + transfers). Filter chips
    `Entity × Action × Tenant × Date range`. Linked from
    `AdminDashboardPage`. Each row expands to show the JSON diff.

### Phase E — Tests

21. `global_vehicles/tests/test_audit.py`
    - Vehicle create / update / delete each emit one row with correct
      `entity` and `changes`.
    - Updating with no real change emits zero rows.
    - Ownership transfer emits `OWNERSHIP / transferred` with
      `target_id = token_id`.
    - Plate change via `registration` action emits
      `REGISTRATION / updated` and *not* a generic `VEHICLE / updated`.
22. `vehicles/tests/test_photos.py`
    - CRUD + permissions (mechanic OK, sales-style user blocked,
      owner read-only).
    - Each CRUD path emits exactly one `PHOTO / *` audit row.
    - Deletions keep `image_path` in `changes.before` so superadmin
      can still find the file on the QNAP share.
23. `global_vehicles/tests/test_audit_endpoint.py`
    - Non-superadmin gets 403.
    - Superadmin can paginate and filter by every supported param.
    - Audit endpoint sees rows from multiple tenants simultaneously.

## Frontend bits worth pre-empting

- The existing `vehicle.photo` (string URL) is read in lots of places
  (hero card, list, door-sticker, owner pages). For step 3 above we set
  `vehicle.photo = primary photo URL` in `VehicleSerializer.to_representation`
  so all those screens keep working with no edits.
- Add `vehicle.photos: VehiclePhoto[]` to the same serializer.
- The mobile gallery should use a 2-col grid on `<sm`, 3-col on `sm+`,
  4-col on `lg+`; tap = lightbox; long-press / hover reveals the
  "Edit caption / Delete" action sheet.
- Drag-to-reorder is nice-to-have; v1 can use up/down arrows on each
  card and just patch `position`.

## Storage & retention

- New photos go to the existing QNAP path `vehicle_photos/` —
  no infra changes needed.
- When a photo is `DELETEd`, we *also* unlink the file on disk
  (`photo.image.delete(save=False)`). The audit event still has
  `image_path` so the superadmin can confirm it was removed.

## Out of scope (for v1)

- Image cropping / orientation editing.
- Bulk download (zip).
- Owner being able to upload (only workshops can — preserves the
  "tenant owns operational data" principle).
- Per-photo visibility (private to workshop vs. shared with owner) —
  default v1 is "all photos are visible to the owner via owner portal".

## Acceptance checklist

Photo gallery
- [ ] Mechanic can upload 5 photos to one vehicle from mobile in one
      go (multi-file picker).
- [ ] Non-mechanic tenant user sees the gallery but cannot upload /
      delete (UI hides actions; backend returns 403).
- [ ] Vehicle owner sees the same gallery on their portal (read-only).
- [ ] Deleting a vehicle photo removes the file from QNAP.
- [ ] Existing vehicles still render their old hero photo (data
      migration verified by snapshot of three live tenants).

Vehicle audit log (superadmin only)
- [ ] Creating a vehicle emits one `VEHICLE / created` row.
- [ ] Editing plate, make, model, etc. emits one `VEHICLE / updated` row
      with a `changes` JSON listing every changed field.
- [ ] Archiving / restoring emits `ARCHIVE / archived` or `ARCHIVE /
      restored` — not a noisy generic `updated`.
- [ ] Plate change via the dedicated registration endpoint emits
      `REGISTRATION / updated` (and only that).
- [ ] Ownership transfer via QR emits `OWNERSHIP / transferred` with
      `target_id = token_id`.
- [ ] Owner portal claim emits `OWNERSHIP / claimed`.
- [ ] Photo CRUD emits `PHOTO / created | updated | deleted` rows.
- [ ] `GET /tenants/vehicle-audit/` returns rows from every tenant in
      one query; non-superadmins get 403.
- [ ] Superadmin UI page filters by entity / action / tenant / vehicle
      / date range, and expands each row to show the field-level diff.
- [ ] Saving a vehicle form without any real change does *not* create
      a noise row.
