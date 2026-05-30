# Mechanic360: Multi-Tenant Mechanic Workshop Management Platform  
## Software Requirements & Working Scope

---

## 1. System Overview
A cloud-based **multi-tenant** platform for automotive and machinery maintenance workshops.  
Each workshop (tenant) manages:
- Clients
- Vehicles
- Service visits
- 360° inspections
- Inventory (parts & materials)
- Preventive maintenance reminders
- Internal marketplace for part sharing

QR codes allow fast vehicle identification at check-in.  
Mobile/tablet friendly interface for mechanics.

---

## 2. Tenant (Workshop) Management
Each workshop has:
- Business name, logo, address, contact info
- Subscription / billing plan — **platform subscription** configured by superadmin (`TenantPlatformBilling`); issuer company/VAT for PDFs at Admin → Company; membership period start/end on admin tenant views — see **[PLATFORM_SUBSCRIPTION_BILLING.md](PLATFORM_SUBSCRIPTION_BILLING.md)**
- Staff accounts with roles:
  - Admin
  - Service Advisor
  - Mechanic / Technician
- Custom branding for:
  - Reports
  - Service door stickers
  - Invoices (future phase)

Tenant visibility in **Marketplace**:
- Name
- City / Region
- Contact (phone/WhatsApp)

_No vehicle or client data is shared._

### Staff onboarding, profile & mechanic KPIs

Workshop admins add mechanics and service advisors to their tenant (invite/create accounts, deactivate when needed). Each mechanic’s work is attributed at visit, inspection, and service-line level for reports and KPI dashboards. User profile, password/PIN change, and login success/failure audit are specified in **[USER_PROFILE_MECHANICS_AND_AUDIT.md](USER_PROFILE_MECHANICS_AND_AUDIT.md)**.

**Status (2026-05-30):** Phases A–E implemented including charts and CSV/PDF export on `/analytics/mechanics`. Phase F (Celery email invite) still pending — see doc for remaining polish.

---

## 3. Client Registry
Clients can be:
- Private individuals
- Fleet or company accounts

Stored data:
- Name / Company Name
- Contact details
- Preferred communication channel
- List of owned vehicles
- Visit history overview

---

## 4. Vehicle Registry
For each vehicle:
- **VIN (unique ID)**
- License plate
- Make, model, year
- Engine / fuel type
- Photos
- Odometer / hour-meter historical tracking
- Linked owner
- **QR code generated automatically** (from VIN)

### QR Code Usage
- Printed and placed on windshield / door frame / key tag
- Scanning opens **mobile vehicle profile** for quick check-in

---

## 5. Maintenance Visit Workflow

### Visit Flow:
1. Scan QR or search vehicle
2. Start **New Visit**
3. Enter mileage or operating hours
4. Complete the **Mandatory 360° Inspection**
5. Select services performed
6. Add materials used (automatically deducts from stock)
7. Generate service report + next maintenance reminder
8. Print **Door Sticker** label

---

## 6. 360° Technical Inspection (Mandatory Every Visit)
Standard default checklist (expandable later):

| Section | Items | Input Type | Notes |
|--------|-------|------------|-------|
| Exterior | Lights, scratches, body panels | Pass/Fail + Photo | Quick tap UI |
| Tires | Wear %, air pressure | Slider % + Note | Track wear over time |
| Brakes | Front/rear pad wear %, disc condition | Slider % + Severity | Suggest replacement |
| Engine Bay | Oil level, coolant, leaks | Pass/Fail + Photo | Optional comments |
| Fluids | Brake/steering/washer | Pass/Fail + Refill option | Stock deduction if refilled |
| Battery & Electrical | Battery voltage, charging | Numeric + Pass/Fail | Battery health prediction later |
| Suspension & Steering | Noise, looseness | Severity scale (Green / Yellow / Red) | |
| Underbody | Exhaust, rust, oil leaks | Pass/Fail + Photo | Lift required optional |

Each inspection record:
- Timestamp
- Mechanic who performed it
- Photos attached
- Stored in history timeline
- Included in PDF report

---

## 7. Services & Repairs Logging
- Select services from pre-defined service catalog
- Add custom service lines
- Track labor cost & time
- Link used materials
- Close visit and generate documentation

---

## 8. Preventive Maintenance & Reminders
Supports:
- **KM-based intervals**
- **Hour-based intervals**
- **Calendar-based maintenance (time)**

System calculates next due maintenance and optionally notifies:
- Client (SMS / WhatsApp / Email)
- Workshop dashboard “Upcoming Due List”

---

## 9. Inventory & Material Stock Management
Each item has:
- Name / SKU / Manufacturer
- Purchase cost & Sale price
- Current stock level
- Supplier
- Minimum stock alert threshold

Stock changes:
- Added via purchase / restock
- Removed when used during service
- Logged corrections for audit

---

## 10. Internal Marketplace (Across Tenants)
Allows workshops to:
- Offer spare parts or tools
- View listings from other tenants
- Contact seller directly (phone/WhatsApp)

Listing data shown:
- Item name
- Quantity available
- Price
- Workshop name + location

_No operational or client data shared._

---

## 11. Ownership Transfer
When a vehicle is sold:
- Assign new client as owner
- **Full service & inspection history remains attached to the vehicle**

Exportable:
- “Digital Service Booklet” PDF for resale advantage

---

## 12. QR Code System
- Generated from VIN
- Printable as:
  - Key tag label
  - Windshield sticker
  - Shop wall hang tag

Scanning:
- Opens mobile view with latest visit + next due service

---

## 13. Service Door Sticker (Next Service Label)
Automatically generated after visit completion.

Contents:
- Workshop logo
- License plate / model
- Service date
- Mileage/Hours at service
- **Next due service**
- Mechanic initials

Printable formats:
- A5 sheet PDF
- Zebra / Dymo thermal printer label (48–57mm width)

---

## 14. Reports & Analytics Dashboard
- Number of visits by period
- Revenue and service breakdown (future phase)
- Parts consumption statistics
- Preventive maintenance forecasting list
- **Per-mechanic KPIs** — visits completed, labor hours, vehicles serviced, revenue attributed (see [USER_PROFILE_MECHANICS_AND_AUDIT.md](USER_PROFILE_MECHANICS_AND_AUDIT.md))
- Export to PDF / Excel

---

## 15. Security & Architecture
- Single PostgreSQL with **schema-based multi-tenancy** (`django-tenants`); RLS optional later
- JWT authentication (httpOnly cookies)
- **Login audit log** — record successful and failed sign-in attempts (username, IP, outcome); tenant admin and superuser views (see [USER_PROFILE_MECHANICS_AND_AUDIT.md](USER_PROFILE_MECHANICS_AND_AUDIT.md))
- **User profile & password change** — reliable settings API and Settings UI (fix in progress)
- **File storage**: QNAP NAS on the LAN — Django `MEDIA_ROOT` bind-mounted to a QNAP shared folder (NFS/SMB)
- Backend: **Django 5+** with Django REST Framework (Python)
- Frontend: React with TypeScript (mobile-first PWA)
- Containerized with Docker for deployment
- **GDPR Compliance** measures (planned)
- **ISO 27001** security controls (planned)

See [working_scope/ARCHITECTURE.md](working_scope/ARCHITECTURE.md) for topology diagrams and QNAP integration details.

---

## 16. Tech Stack Definition

### Frontend
- **Framework**: React 18+ with TypeScript
- **State Management**: Redux Toolkit and React Query
- **Styling**: Tailwind CSS with custom theme
- **UI Components**: Headless UI / shadcn/ui with Lucide icons
- **Form Handling**: React Hook Form + Zod validation
- **PWA Support**: Workbox for offline capabilities
- **QR Code**: react-qr-code for generation and scanning
- **Charts/Analytics**: Recharts for data visualization
- **PDF Generation**: react-pdf for reports and stickers
- **Build Tool**: Vite

### Backend
- **Framework**: Django 5+ with Django REST Framework (Python)
- **API**: REST with OpenAPI/Swagger documentation (drf-spectacular or drf-yasg)
- **Data Serialization**: JSON (primary) with optional Protocol Buffers (protobuf) adapters for efficient data exchange where needed
- **Authentication**: JWT with refresh tokens (djangorestframework-simplejwt)
- **Authorization**: Role-based and per-object permissions via Django permissions + custom policies
- **Database ORM**: Django ORM
- **Validation**: Django & DRF serializers/validators
- **File Storage**: QNAP NAS shared folder (LAN mount to `MEDIA_ROOT`)
- **Notifications**: Email (e.g. SMTP, SendGrid) and Twilio (SMS/WhatsApp) integration
- **Background Jobs**: Celery or RQ with Redis for reminders and async processing

### Database & Storage
- **RDBMS**: PostgreSQL 15+ with schema-based multi-tenancy
- **Multi-tenancy**: Row-Level Security (RLS) policies
- **Migrations**: Managed through Prisma
- **Object / file storage**: QNAP NAS (NFS/SMB mount to Django `MEDIA_ROOT`)

### DevOps
- **Containerization**: Docker with Docker Compose
- **CI/CD**: GitHub Actions
- **Monitoring**: Prometheus + Grafana
- **Logging**: ELK Stack

### API & Data Exchange
- **Schema Definition**: Protocol Buffers (protobuf)
- **Benefits**:
  - Strongly typed data structures
  - Efficient binary serialization (smaller payload size)
  - Language-agnostic schema definition
  - Backward/forward compatibility
  - Automatic TypeScript type generation

### GDPR Compliance & Data Protection
- **User Consent Management**:
  - Explicit consent tracking for data processing
  - Granular privacy preferences
  - Consent withdrawal mechanism

- **Data Subject Rights**:
  - Right to access personal data (data export in machine-readable format)
  - Right to be forgotten (account/data deletion)
  - Right to data portability
  - Right to rectification (edit personal information)

- **Data Protection Measures**:
  - Data minimization principles
  - Encryption of personal data at rest and in transit
  - Pseudonymization where appropriate
  - Data retention policies with automatic cleanup

- **Documentation & Accountability**:
  - Privacy policy generator for tenants
  - Data processing records
  - Data breach notification system

### ISO 27001 Security Controls
- **Information Security Policies**:
  - Documented security policies
  - Regular security reviews

- **Access Control**:
  - Role-based access control (RBAC)
  - Principle of least privilege
  - Strong password policies
  - Multi-factor authentication
  - Session timeout controls

- **Cryptography**:
  - TLS 1.3 for all communications
  - AES-256 encryption for sensitive data
  - Secure key management

- **Physical & Environmental Security**:
  - Cloud provider compliance verification
  - Geographical data residency options

- **Operations Security**:
  - Logging and monitoring
  - Protection from malware
  - Technical vulnerability management
  - Backup procedures

- **Communications Security**:
  - Network security controls
  - API security (rate limiting, input validation)
  - Secure file transfer protocols

- **System Acquisition & Development**:
  - Secure development lifecycle
  - Security testing in CI/CD pipeline
  - Dependency vulnerability scanning

---

## Next Required Decision
Should the **360° inspection checklist** be:

**Standardized** (same for all workshops)  
or  
**Customizable** per tenant?

Reply with one word to confirm:
**Standardized** / **Customizable**

**Decision (2026-05): Standardized** — all workshops use the same checklist defined in the app (`InspectionForm.tsx`); per-tenant customization is deferred.
