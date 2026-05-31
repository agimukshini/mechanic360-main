"""Branded emails for workshop onboarding (application, approval, rejection)."""
from __future__ import annotations

import uuid

from django.conf import settings

from mechanic360.email_service import frontend_base_url, issuer_email_context, send_branded_email, unique_recipients

from .kyc import platform_onboarding_contact_dict
from .models import TenantOnboardingApplication
from .verification_services import get_or_create_verification_token, verification_absolute_url


def _frontend_url() -> str:
    return frontend_base_url()


def _bilingual_subject(sq: str, en: str) -> str:
    return f"Mekaniku360 — {sq} / {en}"


def _application_context(application: TenantOnboardingApplication) -> dict:
    platform = platform_onboarding_contact_dict()
    token = get_or_create_verification_token(application)
    return {
        **issuer_email_context(),
        "frontend_url": _frontend_url(),
        "recipient_name": application.admin_username,
        "workshop_name": application.workshop_name,
        "business_registration_number": application.business_registration_number,
        "address": application.address,
        "contact_email": application.contact_email,
        "contact_phone": application.contact_phone,
        "admin_username": application.admin_username,
        "admin_email": application.admin_email,
        "verification_code": application.verification_code,
        "verify_url": verification_absolute_url(token.id),
        "verify_expires_at": token.expires_at,
        "platform_contact_name": platform.get("company_name") or "",
        "platform_contact_email": platform.get("email") or "",
        "platform_contact_phone": platform.get("phone") or "",
        "login_url": f"{_frontend_url()}/login",
    }


def _application_recipients(application: TenantOnboardingApplication) -> list[str]:
    return unique_recipients(application.admin_email, application.contact_email)


def send_onboarding_application_received_email(application_id: str) -> dict:
    application = TenantOnboardingApplication.objects.get(pk=uuid.UUID(str(application_id)))
    recipients = _application_recipients(application)
    if not recipients:
        return {"sent": 0, "recipients": []}

    sent = send_branded_email(
        subject=_bilingual_subject(
            "Aplikimi i punëtorisë u pranua",
            "Workshop application received",
        ),
        to=recipients,
        template_name="onboarding_application_received",
        context=_application_context(application),
    )
    return {"sent": sent, "recipients": recipients}


def send_onboarding_application_approved_email(application_id: str) -> dict:
    application = TenantOnboardingApplication.objects.select_related("tenant").get(
        pk=uuid.UUID(str(application_id))
    )
    recipients = _application_recipients(application)
    if not recipients:
        return {"sent": 0, "recipients": []}

    ctx = _application_context(application)
    ctx["tenant_schema_name"] = application.tenant.schema_name if application.tenant_id else ""

    sent = send_branded_email(
        subject=_bilingual_subject(
            "Llogaria e punëtorisë është aktive",
            "Your workshop account is active",
        ),
        to=recipients,
        template_name="onboarding_application_approved",
        context=ctx,
    )
    return {"sent": sent, "recipients": recipients}


def send_onboarding_application_rejected_email(application_id: str) -> dict:
    application = TenantOnboardingApplication.objects.get(pk=uuid.UUID(str(application_id)))
    recipients = _application_recipients(application)
    if not recipients:
        return {"sent": 0, "recipients": []}

    ctx = _application_context(application)
    ctx["rejection_reason"] = application.rejection_reason.strip() or "No reason provided."

    sent = send_branded_email(
        subject=_bilingual_subject(
            "Përditësim i aplikimit",
            "Workshop application update",
        ),
        to=recipients,
        template_name="onboarding_application_rejected",
        context=ctx,
    )
    return {"sent": sent, "recipients": recipients}
