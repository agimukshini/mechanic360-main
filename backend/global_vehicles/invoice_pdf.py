"""
PDF export for platform invoices (WeasyPrint).
"""
from __future__ import annotations

from decimal import Decimal

from django.http import HttpResponse
from django.template.loader import render_to_string
from django.utils import timezone
from weasyprint import HTML

from visits.report_labels import PLATFORM_INVOICE, get_labels, normalize_language
from visits.report_utils import currency_symbol

from .issuer_services import issuer_for_invoice, vat_breakdown
from .models import PlatformInvoice

PAYMENT_STATUS_CLASS = {
    "paid": "ok",
    "unpaid": "bad",
    "processing": "warn",
    "refunded": "neutral",
    "waived": "neutral",
}


def _issuer_display_name(issuer: dict) -> str:
    return (
        issuer.get("trade_name")
        or issuer.get("company_name")
        or issuer.get("display_name")
        or "Mechanic360 Platform"
    )


def _payment_status_class(payment_status: str) -> str:
    return PAYMENT_STATUS_CLASS.get(payment_status, "neutral")


def _payment_status_label(invoice: PlatformInvoice, labels: dict[str, str]) -> str:
    key = f"status_{invoice.payment_status}"
    return labels.get(key, invoice.get_payment_status_display())


def _line_items_for_template(invoice: PlatformInvoice) -> list[dict]:
    items = invoice.line_items or []
    if items:
        return [
            {
                "description": str(item.get("description", "")),
                "amount": Decimal(str(item.get("amount", invoice.amount))),
                "currency": str(item.get("currency", invoice.currency)),
            }
            for item in items
        ]
    return [
        {
            "description": invoice.get_kind_display(),
            "amount": invoice.amount,
            "currency": invoice.currency,
        }
    ]


def build_platform_invoice_context(invoice: PlatformInvoice) -> dict:
    tenant = invoice.tenant
    issuer = issuer_for_invoice(invoice)
    language = normalize_language(getattr(tenant, "language", "sq"))
    labels = get_labels(PLATFORM_INVOICE, language)
    currency_code = invoice.currency or "EUR"
    sym = currency_symbol(currency_code)

    rate = Decimal(str(issuer.get("vat_rate_percent") or "0"))
    includes_vat = bool(issuer.get("amounts_include_vat", True))
    totals = vat_breakdown(
        invoice.amount,
        rate_percent=rate,
        amounts_include_vat=includes_vat,
    )

    street = " ".join(
        p for p in [issuer.get("address_line1"), issuer.get("address_line2")] if p
    ).strip()
    city_line = " ".join(
        p for p in [issuer.get("postal_code"), issuer.get("city")] if p
    ).strip()

    return {
        "language": language,
        "L": labels,
        "generated_at": timezone.now(),
        "issuer_display_name": _issuer_display_name(issuer),
        "issuer_company_name": issuer.get("company_name") or "",
        "issuer_trade_name": issuer.get("trade_name") or "",
        "issuer_street": street,
        "issuer_city_line": city_line,
        "issuer_country": issuer.get("country") or "",
        "issuer_vat_number": issuer.get("vat_number") or "",
        "issuer_reg_number": issuer.get("company_registration_number") or "",
        "issuer_email": issuer.get("email") or "",
        "issuer_phone": issuer.get("phone") or "",
        "issuer_website": issuer.get("website") or "",
        "tenant_name": tenant.name,
        "tenant_address": tenant.address or "",
        "tenant_email": tenant.contact_email or "",
        "tenant_phone": tenant.contact_phone or "",
        "invoice_number": invoice.invoice_number,
        "invoice_kind": invoice.get_kind_display(),
        "payment_status": _payment_status_label(invoice, labels),
        "payment_status_class": _payment_status_class(invoice.payment_status),
        "issued_at": invoice.issued_at,
        "due_at": invoice.due_at,
        "period_start": invoice.period_start,
        "period_end": invoice.period_end,
        "invoice_reference": invoice.invoice_reference or "",
        "line_items": _line_items_for_template(invoice),
        "currency_code": currency_code,
        "currency_symbol": sym,
        "totals": totals,
        "show_vat": totals["rate_percent"] > Decimal("0.00"),
        "bank_name": issuer.get("bank_name") or "",
        "iban": issuer.get("iban") or "",
        "invoice_footer": issuer.get("invoice_footer") or "",
    }


def render_platform_invoice_pdf(invoice: PlatformInvoice) -> HttpResponse:
    html = render_to_string(
        "reports/platform_invoice.html",
        build_platform_invoice_context(invoice),
    )
    pdf = HTML(string=html).write_pdf()
    response = HttpResponse(pdf, content_type="application/pdf")
    response["Content-Disposition"] = (
        f'attachment; filename="{invoice.invoice_number}.pdf"'
    )
    return response
