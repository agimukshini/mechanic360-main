# Marketplace + Issue-Based Recommendation Engine — Implementation Roadmap

Status: **Phases A–C implemented** (catalog, recommendations, banner, seller dashboard — 2026-05). Phases D–F (admin analytics, monetisation, full acceptance tests) remain.
Target: Phase D next after compatibility ingest (Phase B).

## Goal

Evolve the current single-table `MarketplaceListing` into a full
parts-marketplace ecosystem integrated into the mechanic's repair
workflow, with multi-vehicle compatibility, issue-based recommendations,
contextual banners, and analytics/monetisation hooks.

## What already exists

- `marketplace.MarketplaceListing` — basic cross-tenant listing
  (tenant, title, description, category, price, contact channels).
  Lives in the **public schema** so all tenants can browse.
- `pages/marketplace/MarketplaceList.tsx` — listing UI.

Everything else in the user spec (compatibility, recommendations,
banner, billing for sellers) is greenfield.

## Requirements summary

Catalog
- Multi-make / multi-model / multi-year / engine / trim compatibility
  per part (never assume "one part = one vehicle").
- Cache external compatibility API results locally.
- Search by part number, OEM, vehicle, issue, seller, location, price,
  condition.

Recommendation flow
- Mechanic selects a vehicle issue → system maps issue → part
  categories → searches compatible inventory → returns ranked list.
- Display a contextual banner inside the repair workflow with
  image / name / price / seller / condition / location / availability /
  compatibility confirmation / contact + view-listing buttons.
- Sponsored listings allowed but must be visibly labelled.

Admin
- Superadmin approves sellers, suspends listings, configures pricing /
  membership plans / promoted listings, monitors abuse, moderates.

Analytics / monetisation
- Track impressions, banner impressions, CTR, contact requests, seller
  performance.
- Memberships, sponsored listings, featured banners, lead generation,
  priority placement, API access.

## Data model (public schema)

Everything lives in `marketplace/` and the public schema so listings
cross tenant boundaries.

```python
# Renamed/extended from the existing MarketplaceListing

class MarketplaceSeller(models.Model):
    id = UUIDField(primary_key=True, default=uuid4)

    class SellerType(TextChoices):
        WORKSHOP   = "workshop",   "Workshop"
        PARTS_SHOP = "parts_shop", "Parts shop"
        INDIVIDUAL = "individual", "Individual"

    seller_type   = CharField(max_length=20, choices=SellerType.choices)
    business_name = CharField(max_length=255)
    tenant        = ForeignKey("tenancy.WorkshopTenant", null=True,
                               blank=True, on_delete=SET_NULL,
                               help_text="Set when seller is a workshop on the platform.")
    contact_user  = ForeignKey(User, null=True, blank=True,
                               on_delete=SET_NULL)
    location_city = CharField(max_length=128, blank=True)
    location_country = CharField(max_length=64, default="XK")
    location_geo  = PointField(null=True, blank=True)  # for radius search

    membership_plan = CharField(max_length=32, default="free")
    billing_status  = CharField(max_length=16, default="active")
    is_approved     = BooleanField(default=False)
    approved_at     = DateTimeField(null=True, blank=True)
    approved_by     = ForeignKey(User, null=True, on_delete=SET_NULL,
                                 related_name="approved_sellers")

    created_at = DateTimeField(auto_now_add=True)
    updated_at = DateTimeField(auto_now=True)


class PartCategory(models.Model):
    id   = AutoField(primary_key=True)
    slug = SlugField(unique=True)
    name = CharField(max_length=128)
    parent = ForeignKey("self", null=True, blank=True,
                        related_name="children", on_delete=CASCADE)
    # examples: brake_system → brake_pads, brake_discs, calipers


class SparePart(models.Model):
    id     = UUIDField(primary_key=True, default=uuid4)
    seller = ForeignKey(MarketplaceSeller, related_name="parts",
                        on_delete=CASCADE)

    part_number          = CharField(max_length=64, db_index=True)
    oem_number           = CharField(max_length=64, blank=True, db_index=True)
    alternative_numbers  = JSONField(default=list, blank=True)
    category             = ForeignKey(PartCategory, on_delete=PROTECT)
    title                = CharField(max_length=255)
    description          = TextField(blank=True)

    class Condition(TextChoices):
        NEW          = "new",          "New"
        USED         = "used",         "Used"
        REFURBISHED  = "refurbished",  "Refurbished"
        OEM_TAKEOFF  = "oem_takeoff",  "OEM take-off"

    condition  = CharField(max_length=16, choices=Condition.choices)
    quantity   = PositiveIntegerField(default=1)
    price      = DecimalField(max_digits=10, decimal_places=2)
    currency   = CharField(max_length=3, default="EUR")

    is_active     = BooleanField(default=True)
    is_promoted   = BooleanField(default=False)
    promoted_until= DateTimeField(null=True, blank=True)

    photos     = JSONField(default=list, blank=True)   # list of /media paths
    location_override = PointField(null=True, blank=True)

    impressions      = PositiveIntegerField(default=0)
    contact_requests = PositiveIntegerField(default=0)

    created_at = DateTimeField(auto_now_add=True)
    updated_at = DateTimeField(auto_now=True)

    class Meta:
        indexes = [
            Index(fields=["category", "is_active"]),
            Index(fields=["part_number"]),
            Index(fields=["oem_number"]),
            GinIndex(fields=["alternative_numbers"]),
        ]


class VehicleCompatibility(models.Model):
    """One row per (part, vehicle-range) pair. Multi-fit by design."""
    id         = UUIDField(primary_key=True, default=uuid4)
    spare_part = ForeignKey(SparePart, related_name="compatibilities",
                            on_delete=CASCADE)

    make       = CharField(max_length=64, db_index=True)
    model      = CharField(max_length=64, db_index=True)
    year_from  = PositiveIntegerField()
    year_to    = PositiveIntegerField()
    engine     = CharField(max_length=64, blank=True)
    trim       = CharField(max_length=64, blank=True)

    class Source(TextChoices):
        TECDOC   = "tecdoc"
        CARAPI   = "carapi"
        MANUAL   = "manual"
        SELLER   = "seller"
        INFERRED = "inferred"

    compatibility_source = CharField(max_length=16, choices=Source.choices)
    confidence_score     = FloatField(default=1.0)   # 0..1

    class Meta:
        unique_together = [("spare_part", "make", "model",
                            "year_from", "year_to", "engine", "trim")]
        indexes = [
            Index(fields=["make", "model", "year_from", "year_to"]),
        ]


class VehicleIssue(models.Model):
    """Mechanic-facing issue taxonomy, mapped to part categories."""
    id   = AutoField(primary_key=True)
    slug = SlugField(unique=True)
    name = CharField(max_length=128)
    description = TextField(blank=True)
    mapped_categories = ManyToManyField(PartCategory,
                                        related_name="issues")


class MarketplaceBannerEvent(models.Model):
    """Per-impression and per-click telemetry for the recommendation banner."""
    id = UUIDField(primary_key=True, default=uuid4)

    mechanic_tenant_schema = CharField(max_length=63, db_index=True)
    mechanic_user_id       = UUIDField(db_index=True)
    vehicle_tenant_id      = UUIDField(null=True)
    global_vehicle_id      = UUIDField(null=True)
    issue                  = ForeignKey(VehicleIssue, null=True,
                                        on_delete=SET_NULL)

    displayed_part_ids = JSONField(default=list)   # list of SparePart.id
    clicked_part_id    = UUIDField(null=True, blank=True)
    contact_clicked    = BooleanField(default=False)

    occurred_at = DateTimeField(auto_now_add=True, db_index=True)
```

## Migration of existing `MarketplaceListing`

- Add new tables alongside.
- One-shot data migration: each existing `MarketplaceListing` becomes
  one `MarketplaceSeller` (or matches an existing one for the same
  tenant) plus one `SparePart` row with `category = other` and no
  `VehicleCompatibility` rows. Listings without `category=parts` stay
  in a legacy `MarketplaceListing` table for now.
- Keep `MarketplaceListing` for two releases for read-back compatibility.

## Compatibility data sources

External integrations evaluated in this order:
1. **TecDoc / CarAPI** (preferred — comprehensive, paid).
2. **NHTSA vPIC** (free, US-centric VIN decoding).
3. **OEM catalogs** (per-make scraping, last resort).

Implementation
- `marketplace/compat/__init__.py` defines a `CompatibilityProvider`
  protocol with `lookup_by_oem(oem) -> List[CompatibilityRow]` and
  `lookup_by_vin(vin) -> List[CompatibilityRow]`.
- Concrete providers behind feature flags.
- Every result is upserted into `VehicleCompatibility` so subsequent
  queries hit the local cache. `compatibility_source` records which
  provider returned it.

## Recommendation engine

1. Mechanic picks a vehicle on the visit screen → already have
   `Vehicle.make / model / year`.
2. Mechanic picks (or types) an issue → maps to one or more
   `PartCategory` via `VehicleIssue.mapped_categories`.
3. Query:
   ```
   SparePart
     .filter(is_active=True,
             category__in=mapped_categories,
             compatibilities__make__iexact=vehicle.make,
             compatibilities__model__iexact=vehicle.model,
             compatibilities__year_from__lte=vehicle.year,
             compatibilities__year_to__gte=vehicle.year)
     .annotate(boost=Case(When(is_promoted=True, then=Value(1.0)),
                          default=Value(0.0)))
     .order_by("-boost", "-confidences__confidence_score",
               "price")
   ```
4. Limit to N (default 6 for the banner, 50 for full search).
5. Emit a `MarketplaceBannerEvent` with the displayed IDs.

Ranking tiebreakers (configurable later): seller membership tier,
distance, condition, in-stock quantity.

## API surface

Mechanic-facing
| Method | Path                                              | Notes                                        |
| ------ | ------------------------------------------------- | -------------------------------------------- |
| GET    | `/api/v1/marketplace/issues/`                     | issue catalog                                |
| GET    | `/api/v1/marketplace/recommendations/?vehicle=<id>&issue=<slug>` | banner data                |
| GET    | `/api/v1/marketplace/parts/?…`                    | full search (part_number, oem, make/model, year, category, condition, location, price) |
| POST   | `/api/v1/marketplace/banner-events/<id>/click/`   | tracks `clicked_part_id`                     |
| POST   | `/api/v1/marketplace/banner-events/<id>/contact/` | tracks `contact_clicked`                     |

Seller-facing (tenant or external seller user)
| Method | Path                                  | Notes                                |
| ------ | ------------------------------------- | ------------------------------------ |
| GET / POST / PATCH / DELETE | `/api/v1/marketplace/sellers/me/` | own seller record         |
| GET / POST / PATCH / DELETE | `/api/v1/marketplace/parts/`      | own parts                 |
| POST   | `/api/v1/marketplace/parts/<id>/compatibility/` | manual entry          |

Superadmin
| Method | Path                                  | Notes                                |
| ------ | ------------------------------------- | ------------------------------------ |
| POST   | `/api/v1/marketplace/admin/sellers/<id>/approve/`  | gates listing visibility |
| POST   | `/api/v1/marketplace/admin/parts/<id>/suspend/`    |                          |
| GET    | `/api/v1/marketplace/admin/analytics/`             | impressions, CTR, etc.   |
| CRUD   | `/api/v1/marketplace/admin/membership-plans/`      |                          |
| CRUD   | `/api/v1/marketplace/admin/promotions/`            | sponsored placements     |

## Frontend

Mechanic workflow integration
- New tab "Parts" inside `VisitDetail.tsx` and during work-line entry.
  Shows the recommendation banner driven by the current vehicle +
  the mechanic-selected issue dropdown.
- `MarketplaceBanner.tsx` component — horizontal scroll of up to 6
  part cards (image, name, price, condition, "Compatible with this
  vehicle" pill, Contact and View buttons). Sponsored cards have a
  visible "Sponsored" label.

Marketplace browse
- Rebuild `MarketplaceList.tsx` around `SparePart`.
- Filters sidebar: category, vehicle (make/model/year picker),
  condition, price range, location, seller.
- Part detail page with full compatibility list, seller card,
  contact actions.

Seller dashboard
- New `pages/marketplace/SellerDashboard.tsx` — list/edit own parts,
  see impressions/CTR/contact-requests per part.
- Multi-photo upload reusing the gallery component from the photo
  roadmap.

Superadmin
- `pages/admin/AdminMarketplacePage.tsx`:
  - Pending seller approvals table.
  - Listings moderation table (search + flagged listings).
  - Analytics dashboard (impressions, CTR, top sellers, top issues).
  - Membership plan + promotion editors.

## Implementation order

Phase A — Catalog foundation
1. Models + migrations: `MarketplaceSeller`, `PartCategory`,
   `SparePart`, `VehicleCompatibility`, `VehicleIssue`,
   `MarketplaceBannerEvent`.
2. Data migration from existing `MarketplaceListing`.
3. Seller CRUD + approval workflow + superadmin endpoints.
4. Part CRUD (still no recommendations or compatibility API).

Phase B — Compatibility ingest
5. `CompatibilityProvider` protocol + one provider (TecDoc or vPIC
   sandbox) behind a feature flag.
6. Background task to ingest compatibility for a given OEM or VIN.
7. Manual compatibility editor for sellers.

Phase C — Recommendation engine + banner
8. `VehicleIssue` taxonomy + admin editor.
9. Recommendation endpoint with the ranking SQL above.
10. `MarketplaceBanner` component on the visit / work screens.
11. Banner event telemetry (impression, click, contact).

Phase D — Search & analytics
12. Full marketplace search page (filters + part detail).
13. Seller dashboard with per-part impressions / CTR.
14. Superadmin analytics page.

Phase E — Monetisation
15. Membership plans + sponsored-listing fields.
16. Hook into the same billing concept as `TransferBilling` from the
    ownership roadmap (one shared invoice abstraction).

Phase F — Tests
17. Recommendation correctness with multi-fit parts.
18. Compatibility cache hit/miss behaviour.
19. Sponsored ordering correctness + "Sponsored" label asserted.
20. Banner event emission on every render.
21. Superadmin approval gates: unapproved sellers' parts never show
    up to mechanics.

## Anti-patterns to enforce

- Never store "vehicle" as a single FK on `SparePart`. Always go
  through `VehicleCompatibility` (multi-fit).
- Never expose unapproved sellers in mechanic-facing endpoints.
- Sponsored ordering must be deterministic and visible. Sponsored
  cards always carry the "Sponsored" badge in the API response, not
  just the UI — keeps the contract honest.
- Recommendation queries must always pass through
  `is_active=True` for both seller and part — soft-deleted rows
  never appear.
- Banner event writes should be best-effort (don't block the render
  on an analytics write).

## Acceptance checklist

Catalog
- [ ] A single part can be marked compatible with three different
      make/model/year ranges and shows up correctly for all three.
- [ ] Searching by OEM number returns the canonical part and its
      `alternative_numbers` matches too.

Recommendation flow
- [ ] Mechanic on a 2017 Audi A4 visit, picks "Brake system" →
      banner returns brake pads / discs / sensors / calipers from at
      least two different sellers.
- [ ] Sponsored items appear first and carry a visible badge.
- [ ] Clicking a part records `clicked_part_id` on the banner event;
      clicking Contact flips `contact_clicked`.

Sellers
- [ ] Unapproved seller's parts are invisible to mechanics, visible to
      the seller and superadmin only.
- [ ] Suspending a part hides it from search and the banner
      immediately, without deleting it.

Compatibility ingest
- [ ] Looking up an OEM number that isn't cached calls the provider
      once, writes one or more rows to `VehicleCompatibility`, and
      subsequent identical lookups skip the provider.

Superadmin
- [ ] `/marketplace/admin/analytics/` returns per-day impressions,
      CTR, top sellers, top issues.
- [ ] Approval, suspension, membership-plan edits, and promotion
      edits all appear in an audit log (reuse `VehicleAuditEvent` or
      a parallel `MarketplaceAuditEvent` — decide in Phase E).
