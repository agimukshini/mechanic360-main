"""
Workshop onboarding KYC helpers (ARBK business identity + verification code).
"""
from __future__ import annotations

import re
import secrets

from rest_framework.exceptions import ValidationError

from .models import TenantOnboardingApplication, WorkshopTenant

NUI_PATTERN = re.compile(r"^\d{9}$")


def normalize_nui(value: str) -> str:
    """Strip formatting and return digits-only NUI."""
    return re.sub(r"\D", "", (value or "").strip())


def validate_nui_format(nui: str) -> str:
    normalized = normalize_nui(nui)
    if not NUI_PATTERN.match(normalized):
        raise ValidationError(
            {"business_registration_number": "Enter a valid 9-digit ARBK business number (NUI)."}
        )
    return normalized


def generate_verification_code() -> str:
    """Human-friendly code for applicants to send to platform contact."""
    return secrets.token_hex(4).upper()


def assert_nui_available(nui: str, *, exclude_application_id=None) -> None:
    if WorkshopTenant.objects.filter(business_registration_number=nui).exists():
        raise ValidationError(
            {"business_registration_number": "This business number is already registered on the platform."}
        )

    pending = TenantOnboardingApplication.objects.filter(
        business_registration_number=nui,
        status=TenantOnboardingApplication.Status.PENDING,
    )
    if exclude_application_id:
        pending = pending.exclude(id=exclude_application_id)
    if pending.exists():
        raise ValidationError(
            {"business_registration_number": "An application with this business number is already pending review."}
        )


def platform_onboarding_contact_dict() -> dict:
    from global_vehicles.models import PlatformIssuerProfile
    from mechanic360.email_service import platform_contact_email

    profile = PlatformIssuerProfile.load()
    return {
        "company_name": profile.display_name or profile.company_name or "",
        "email": platform_contact_email(),
        "phone": profile.phone or "",
    }
