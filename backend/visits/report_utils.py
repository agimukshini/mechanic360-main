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


def _normalize_person_name(name: str) -> str:
    return " ".join((name or "").split()).casefold()


def visit_customer_client(visit):
    """Vehicle owner is the canonical customer on printed reports."""
    vehicle = getattr(visit, "vehicle", None)
    owner = getattr(vehicle, "owner", None) if vehicle else None
    return owner or visit.client


def visit_mechanic_user(visit, inspection=None):
    """Staff who performed the work (not the vehicle owner / customer)."""
    if inspection is None:
        inspection = getattr(visit, "inspection", None)
    if inspection is not None:
        performed_by = getattr(inspection, "performed_by", None)
        if performed_by is not None:
            return performed_by
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
                "technician_name": mechanic_display_name(
                    visit, inspection, customer_name=customer_name
                ),
            }
        )

    return blocks, grand_total
