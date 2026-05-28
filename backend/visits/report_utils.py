"""
Helpers for PDF service reports.
"""
from __future__ import annotations

from django.utils import timezone

from .report_labels import get_labels, normalize_language
from .report_labels import SERVICE_BOOKLET as BOOKLET_LABELS
from .report_labels import DOOR_STICKER as STICKER_LABELS
from .report_labels import SERVICE_REPORT as REPORT_LABELS

CURRENCY_SYMBOLS = {
    "EUR": "€",
    "USD": "$",
    "GBP": "£",
    "ALL": "Lek ",
}


def currency_symbol(code: str | None) -> str:
    if not code:
        return "€"
    return CURRENCY_SYMBOLS.get(code.upper(), f"{code.upper()} ")


def workshop_context_from_request(request) -> dict:
    """Build letterhead fields from the authenticated user's tenant."""
    user = getattr(request, "user", None)
    tenant = getattr(user, "tenant", None) if user and user.is_authenticated else None

    language = normalize_language(getattr(tenant, "language", "sq") if tenant else "sq")

    if tenant:
        return {
            "workshop_name": tenant.name,
            "workshop_address": tenant.address or "",
            "workshop_phone": tenant.contact_phone or "",
            "workshop_email": tenant.contact_email or "",
            "currency_code": getattr(tenant, "currency", "EUR") or "EUR",
            "currency_symbol": currency_symbol(getattr(tenant, "currency", "EUR")),
            "language": language,
            "L": get_labels(REPORT_LABELS, language),
            "L_sticker": get_labels(STICKER_LABELS, language),
            "L_booklet": get_labels(BOOKLET_LABELS, language),
        }

    return {
        "workshop_name": "Workshop360",
        "workshop_address": "",
        "workshop_phone": "",
        "workshop_email": "",
        "currency_code": "EUR",
        "currency_symbol": "€",
        "language": language,
        "L": get_labels(REPORT_LABELS, language),
        "L_sticker": get_labels(STICKER_LABELS, language),
        "L_booklet": get_labels(BOOKLET_LABELS, language),
    }


def tenant_language_from_request(request) -> str:
    user = getattr(request, "user", None)
    tenant = getattr(user, "tenant", None) if user and user.is_authenticated else None
    return normalize_language(getattr(tenant, "language", "sq") if tenant else "sq")


def client_display_name(client) -> str:
    if not client:
        return ""
    if getattr(client, "type", None) == "company" and getattr(client, "company_name", ""):
        return client.company_name
    return getattr(client, "name", "") or getattr(client, "company_name", "") or ""


def user_display_name(user) -> str:
    if not user:
        return ""
    full = (user.get_full_name() or "").strip()
    return full or (user.username or "")


def line_performer_name(line) -> str:
    """Display name for a service or labor line's assigned mechanic."""
    return user_display_name(getattr(line, "performed_by", None))


def visit_has_line_attribution(visit) -> bool:
    for line in visit.service_lines.all():
        if getattr(line, "performed_by_id", None):
            return True
    for line in visit.labor_lines.all():
        if getattr(line, "performed_by_id", None):
            return True
    return False


def _normalize_person_name(name: str) -> str:
    return " ".join((name or "").split()).casefold()


class _GlobalOwnerClient:
    """
    Thin adapter so the report template can treat a `GlobalOwner` row from the
    public schema the same as a tenant-local `Client`. Exposes the fields the
    template references (`name`, `company_name`, `phone`, `email`, `type`).
    """

    type = "individual"
    company_name = ""

    def __init__(self, name: str, phone: str = "", email: str = "") -> None:
        self.name = name or ""
        self.phone = phone or ""
        self.email = email or ""


def vehicle_global_owner(vehicle):
    """
    Resolve the active owner of a vehicle via the global registry (public
    schema). Returns `None` when the vehicle is not linked, has no global
    record, or has no active ownership.
    """
    if vehicle is None or not getattr(vehicle, "global_vehicle_id", None):
        return None
    # Imported lazily so this module stays importable without django apps
    # ready during e.g. management command introspection.
    from vehicles.global_sync import get_global_vehicle

    try:
        global_vehicle = get_global_vehicle(vehicle)
    except Exception:  # pragma: no cover — defensive against schema/tenant errors
        return None
    if global_vehicle is None:
        return None
    return getattr(global_vehicle, "current_owner", None)


def visit_customer_client(visit):
    """
    Vehicle owner is the canonical customer on printed reports.

    Falls back in this order:
      1. Tenant-local `Vehicle.owner` (a `clients.Client`).
      2. Tenant-local `ServiceVisit.client`.
      3. Global registry — the active `GlobalOwner` linked to this VIN.

    The third path is what makes the report show the actual owner when a shop
    has only claimed the vehicle in the global registry (the modern flow)
    without also creating a redundant local client record.
    """
    vehicle = getattr(visit, "vehicle", None)
    owner = getattr(vehicle, "owner", None) if vehicle else None
    if owner is not None:
        return owner
    if visit.client is not None:
        return visit.client

    global_owner = vehicle_global_owner(vehicle)
    if global_owner is None:
        return None
    return _GlobalOwnerClient(
        name=getattr(global_owner, "name", "") or "",
        phone=getattr(global_owner, "phone", "") or "",
        email=getattr(global_owner, "email", "") or "",
    )


def visit_mechanic_user(visit, inspection=None):
    """Staff who performed the work (not the vehicle owner / customer)."""
    if inspection is None:
        inspection = getattr(visit, "inspection", None)
    if inspection is not None:
        performed_by = getattr(inspection, "performed_by", None)
        if performed_by is not None:
            return performed_by
    for line in visit.service_lines.all():
        if getattr(line, "performed_by_id", None):
            return line.performed_by
    for line in visit.labor_lines.all():
        if getattr(line, "performed_by_id", None):
            return line.performed_by
    return visit.created_by


def mechanic_display_name(visit, inspection=None, *, customer_name: str = "") -> str:
    """
    Mechanic/technician line for PDFs. Never reuse the customer display string
    when names collide (e.g. demo data or mistaken client linkage).
    """
    user = visit_mechanic_user(visit, inspection)
    if not user:
        return ""
    display = user_display_name(user)
    if not display:
        return ""
    if customer_name and _normalize_person_name(display) == _normalize_person_name(customer_name):
        if user.username and _normalize_person_name(user.username) != _normalize_person_name(
            customer_name
        ):
            return user.username
        return ""
    return display


def flatten_inspection_rows(inspection) -> list[dict]:
    """Turn nested inspection JSON into printable table rows."""
    if not inspection or not inspection.data:
        return []

    rows: list[dict] = []
    for section, items in inspection.data.items():
        if not isinstance(items, dict):
            continue
        for item_name, value in items.items():
            if item_name.startswith("_"):
                continue
            display = _format_inspection_value(value)
            status_class = _inspection_status_class(display)
            rows.append(
                {
                    "section": str(section),
                    "item": str(item_name),
                    "value": display,
                    "status_class": status_class,
                }
            )
    return rows


def _format_inspection_value(value) -> str:
    if value is None:
        return "—"
    if isinstance(value, (int, float)):
        return f"{value}%"
    text = str(value).replace("_", " ")
    return text.capitalize()


def _inspection_status_class(display: str) -> str:
    lower = display.lower()
    if lower in ("pass", "ok", "good", "green"):
        return "ok"
    if lower in ("fail", "red", "critical"):
        return "bad"
    if lower in ("warning", "yellow", "advisory", "caution"):
        return "warn"
    return "neutral"


def build_booklet_visit_blocks(visits) -> tuple[list[dict], float]:
    """Prepare per-visit data for the vehicle history / service booklet PDF."""
    blocks: list[dict] = []
    grand_total = 0.0

    for visit in visits:
        service_lines = list(visit.service_lines.all())
        material_lines = list(visit.material_lines.all())
        labor_lines = list(visit.labor_lines.all())

        service_total = sum(float(line.total_price) for line in service_lines)
        material_total = sum(float(line.total_price) for line in material_lines)
        labor_total = sum(float(line.total_price) for line in labor_lines)
        visit_total = service_total + material_total + labor_total
        grand_total += visit_total

        inspection = getattr(visit, "inspection", None)
        customer_name = client_display_name(visit_customer_client(visit))
        show_line_technicians = visit_has_line_attribution(visit)

        blocks.append(
            {
                "visit": visit,
                "service_lines": service_lines,
                "material_lines": material_lines,
                "labor_lines": labor_lines,
                "service_total": service_total,
                "material_total": material_total,
                "labor_total": labor_total,
                "visit_total": visit_total,
                "inspection_rows": flatten_inspection_rows(inspection),
                "show_line_technicians": show_line_technicians,
                "technician_name": mechanic_display_name(
                    visit, inspection, customer_name=customer_name
                ),
            }
        )

    return blocks, grand_total
