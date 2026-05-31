"""Branded HTML email helpers."""
from __future__ import annotations

from django.conf import settings
from django.core.mail import EmailMultiAlternatives
from django.template.loader import render_to_string

DEFAULT_PLATFORM_CONTACT_EMAIL = "mekaniku360@scardustech.com"
DEFAULT_FRONTEND_BASE_URL = "https://mekaniku360.com"


def platform_contact_email() -> str:
    """Public support / onboarding contact shown in emails and applicant flows."""
    return getattr(settings, "PLATFORM_CONTACT_EMAIL", "").strip() or DEFAULT_PLATFORM_CONTACT_EMAIL


def frontend_base_url() -> str:
    """Canonical SPA base URL for links in emails."""
    configured = getattr(settings, "FRONTEND_BASE_URL", "").strip().rstrip("/")
    return configured or DEFAULT_FRONTEND_BASE_URL


def unique_recipients(*emails: str) -> list[str]:
    """Return de-duplicated non-empty email addresses (case-insensitive)."""
    seen: set[str] = set()
    out: list[str] = []
    for raw in emails:
        email = (raw or "").strip()
        if not email:
            continue
        key = email.lower()
        if key in seen:
            continue
        seen.add(key)
        out.append(email)
    return out


def issuer_email_context() -> dict:
    from global_vehicles.issuer_services import issuer_snapshot_dict

    issuer = issuer_snapshot_dict()
    return {
        "issuer_name": issuer.get("display_name") or issuer.get("company_name") or "ScardusTech",
        "issuer_email": platform_contact_email(),
        "issuer_phone": issuer.get("phone") or "",
    }


def send_branded_email(
    *,
    subject: str,
    to: list[str],
    template_name: str,
    context: dict | None = None,
    from_email: str | None = None,
) -> int:
    """
    Send multipart email (plain + HTML) using templates under templates/email/.
    Returns Django send() result count (0 or 1).
    """
    ctx = {
        "site_name": "Mekaniku360",
        "site_name_sq": "Mekaniku360",
        "site_name_en": "Mechanic360",
        "frontend_url": frontend_base_url(),
        **(context or {}),
    }
    html_body = render_to_string(f"email/{template_name}.html", ctx)
    text_body = render_to_string(f"email/{template_name}.txt", ctx)
    message = EmailMultiAlternatives(
        subject=subject,
        body=text_body,
        from_email=from_email or settings.DEFAULT_FROM_EMAIL,
        to=to,
    )
    message.attach_alternative(html_body, "text/html")
    return message.send()
