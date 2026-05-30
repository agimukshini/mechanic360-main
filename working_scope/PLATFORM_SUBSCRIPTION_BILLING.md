# Platform subscription billing & invoicing

Status: **Implemented (2026-05-30)** — per-tenant pricing, subscription invoices, reminders, grace suspension, admin UI, membership period timeline.

---

## Scope

Superadmin configures what each workshop pays Mechanic360 for:

- **Subscription** — recurring monthly/yearly fee (or free/none)
- **Transfer fee** — per ownership transfer (existing)
- **Registration fee** — per global vehicle registration (existing)

Workshop admins see open platform invoices in Settings and billing alert banners when payment is due or overdue.

---

## Data model (public schema)

| Model | Purpose |
|-------|---------|
| `TenantPlatformBilling` | Per-tenant fee config; `subscription_next_charge_at` drives billing cron |
| `PlatformInvoice` | Issued invoices (`kind=subscription`, `period_start`, `period_end`, `due_at`, payment status) |
| `PlatformInvoiceReminder` | Idempotent reminder log (due / period-end / overdue / deactivation) |
| `PlatformIssuerProfile` | Singleton — our company legal details, VAT, bank info for invoice PDFs |

`WorkshopTenant.subscription_plan` is a legacy label only (`none` default). UI uses `subscription_display_key`: `free` \| `trial` (explicit only) \| `paid`.

---

## Company & VAT on invoices

Configure at **Admin → Company / VAT** (`/admin/company`). Stored in `PlatformIssuerProfile` (singleton).

Fields: legal name, trading name, address, VAT number, company registration (NIPT), contact, bank/IBAN, VAT rate %, whether subscription amounts include VAT, invoice footer.

When a subscription invoice is issued, issuer details are frozen in `invoice.snapshot.issuer`. PDF uses the same layout as visit **service reports** (`templates/reports/platform_invoice.html`): letterhead, bill-to section, line items table, net/VAT/total box, payment details (IBAN), and footer. Labels follow tenant language (`sq` / `en`).

API: `GET/PATCH /api/v1/tenants/admin/platform-issuer/`

---

## Membership period timeline

Resolved in `tenancy/subscription_period.py` and exposed on dashboard APIs as:

- `subscription_period_start`
- `subscription_period_end`
- `subscription_days_remaining`

Rules:

1. Open subscription invoice → use invoice period bounds.
2. After at least one invoice → period ends at `subscription_next_charge_at`; start = one period back.
3. Before first invoice → start at `subscription_next_charge_at` (or now); end = +1 billing period.

Shown on **Admin → Tenants** (Period column), tenant detail (progress bar), dashboard, and **Admin → Subscriptions**.

---

## Billing automation

Celery (daily):

- `issue_due_subscription_invoices` — creates invoices when `subscription_next_charge_at <= now`
- `process_subscription_billing_reminders` — emails/banners: 7d/1d before due, 7d/1d before period end, final overdue warning; deactivates tenant after grace (`PLATFORM_BILLING_GRACE_DAYS_AFTER_DUE`, default 14 days)

Reactivation: marking the invoice paid re-enables `tenant.is_active` when no other open subscription debt exists.

---

## Admin UI

| Route | Purpose |
|-------|---------|
| `/admin/subscriptions` | Per-workshop price/period; grid or table view |
| `/admin/invoices` | List, filter, mark paid, PDF export |
| `/admin/company` | Our company legal details, VAT rate, bank info for PDFs |
| `/admin/tenants` | Plan + **period timeline** per row |
| `/admin/tenants/:id` | Billing panel + period progress |

Workshop: **Settings → Platform invoices** + billing alert in dashboard layout.

---

## Key APIs

| Method | Path | Role |
|--------|------|------|
| GET/PATCH | `/api/v1/tenants/platform-billing/<tenant_id>/` | Superadmin |
| GET | `/api/v1/admin/tenants/dashboard/` | Superadmin (includes period fields) |
| GET/PATCH | `/api/v1/admin/invoices/` | Superadmin |
| POST | `/api/v1/admin/invoices/issue-subscription/<tenant_id>/` | Superadmin manual issue |
| GET | `/api/v1/auth/platform-invoices/` | Workshop admin |
| GET | `/api/v1/auth/platform-billing-status/` | Workshop admin (banner payload) |

---

## Operations

**Set price:** Admin → Subscriptions → edit row → Save (or Free / €49/mo presets).

**Issue invoice:** Admin → Tenant detail → Issue subscription invoice, or wait for daily Celery.

**Mark paid:** Admin → Invoices → expand row → payment status + reference.

**Grace:** 14 days after `due_at`, unpaid → `is_active=false` (login blocked).

---

## Tests

- `global_vehicles.tests.test_platform_invoices`
- `global_vehicles.tests.test_platform_issuer` — issuer profile API, VAT breakdown, PDF template
- `global_vehicles.tests.test_subscription_reminders`
- `tenancy.tests.test_subscription_period`
- `tenancy.tests.test_dashboard`

---

## Remaining / future

- [ ] Stripe or bank webhook auto-mark-paid
- [ ] Workshop self-service card payment
- [ ] Subscription history tab (past periods list from invoices)
- [ ] Document grace/reminder days in env example for ops
