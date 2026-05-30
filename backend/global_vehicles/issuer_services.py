"""
Platform issuer (our company) profile for invoice PDFs.
"""
from __future__ import annotations

from decimal import Decimal, ROUND_HALF_UP

from .models import PlatformIssuerProfile


def issuer_snapshot_dict(profile: PlatformIssuerProfile | None = None) -> dict:
    profile = profile or PlatformIssuerProfile.load()
    return {
        "company_name": profile.company_name,
        "trade_name": profile.trade_name,
        "address_line1": profile.address_line1,
        "address_line2": profile.address_line2,
        "city": profile.city,
        "postal_code": profile.postal_code,
        "country": profile.country,
        "vat_number": profile.vat_number,
        "company_registration_number": profile.company_registration_number,
        "email": profile.email,
        "phone": profile.phone,
        "website": profile.website,
        "bank_name": profile.bank_name,
        "iban": profile.iban,
        "vat_rate_percent": str(profile.vat_rate_percent),
        "amounts_include_vat": profile.amounts_include_vat,
        "invoice_footer": profile.invoice_footer,
        "display_name": profile.display_name,
    }


def vat_breakdown(
    amount: Decimal,
    *,
    rate_percent: Decimal,
    amounts_include_vat: bool,
) -> dict:
    """Return net, vat, and gross for one invoice total."""
    amount = Decimal(amount).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)
    rate = Decimal(rate_percent).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)

    if rate <= Decimal("0.00"):
        return {
            "net": amount,
            "vat": Decimal("0.00"),
            "gross": amount,
            "rate_percent": rate,
        }

    if amounts_include_vat:
        gross = amount
        net = (gross / (Decimal("1.00") + rate / Decimal("100.00"))).quantize(
            Decimal("0.01"),
            rounding=ROUND_HALF_UP,
        )
        vat = (gross - net).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)
    else:
        net = amount
        vat = (net * rate / Decimal("100.00")).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)
        gross = (net + vat).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)

    return {
        "net": net,
        "vat": vat,
        "gross": gross,
        "rate_percent": rate,
    }


def issuer_for_invoice(invoice) -> dict:
    """Prefer issuer frozen on the invoice; fall back to current profile."""
    snapshot = invoice.snapshot or {}
    issuer = snapshot.get("issuer")
    if isinstance(issuer, dict) and (issuer.get("company_name") or issuer.get("trade_name")):
        return issuer
    return issuer_snapshot_dict()
