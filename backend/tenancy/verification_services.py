"""One-click onboarding email verification links."""
from __future__ import annotations

from datetime import timedelta

from django.db import transaction
from django.utils import timezone
from rest_framework.exceptions import ValidationError

from mechanic360.email_service import frontend_base_url

from .models import OnboardingVerificationToken, TenantOnboardingApplication


def _frontend_url() -> str:
    return frontend_base_url()


def verification_path(token_id) -> str:
    return f"/verify/onboarding/{token_id}"


def verification_absolute_url(token_id) -> str:
    return f"{_frontend_url()}{verification_path(token_id)}"


def get_or_create_verification_token(
    application: TenantOnboardingApplication,
) -> OnboardingVerificationToken:
    existing = (
        OnboardingVerificationToken.objects.filter(
            application=application,
            clicked_at__isnull=True,
            expires_at__gt=timezone.now(),
        )
        .order_by("-created_at")
        .first()
    )
    if existing:
        return existing
    return OnboardingVerificationToken.objects.create(
        application=application,
        expires_at=timezone.now() + timedelta(days=OnboardingVerificationToken.DEFAULT_TTL_DAYS),
    )


def get_verification_token(token_id: str) -> OnboardingVerificationToken:
    try:
        return OnboardingVerificationToken.objects.select_related("application").get(id=token_id)
    except (OnboardingVerificationToken.DoesNotExist, ValueError) as exc:
        raise ValidationError("Verification link is invalid or no longer available.") from exc


def verification_token_preview(token: OnboardingVerificationToken) -> dict:
    application = token.application
    status = "valid"
    if token.clicked_at is not None:
        status = "used"
    elif token.expires_at <= timezone.now():
        status = "expired"
    elif application.status != TenantOnboardingApplication.Status.PENDING:
        status = "closed"
    return {
        "token_id": str(token.id),
        "status": status,
        "workshop_name": application.workshop_name,
        "application_id": str(application.id),
        "verification_confirmed": application.verification_code_confirmed_at is not None,
        "clicked_at": token.clicked_at,
        "expires_at": token.expires_at,
    }


def _client_ip(request) -> str:
    if request is None:
        return ""
    forwarded = request.META.get("HTTP_X_FORWARDED_FOR", "")
    if forwarded:
        return forwarded.split(",")[0].strip()[:64]
    return (request.META.get("REMOTE_ADDR") or "")[:64]


def _client_user_agent(request) -> str:
    if request is None:
        return ""
    return (request.META.get("HTTP_USER_AGENT") or "")[:512]


@transaction.atomic
def confirm_onboarding_via_email_link(
    token_id: str,
    *,
    request=None,
) -> TenantOnboardingApplication:
    token = get_verification_token(token_id)
    application = token.application

    if application.status != TenantOnboardingApplication.Status.PENDING:
        raise ValidationError("This application is no longer pending review.")

    if token.clicked_at is not None:
        if application.verification_code_confirmed_at:
            return application
        raise ValidationError("This verification link has already been used.")

    if token.expires_at <= timezone.now():
        raise ValidationError("This verification link has expired.")

    ip = _client_ip(request)
    user_agent = _client_user_agent(request)
    now = timezone.now()

    token.clicked_at = now
    token.click_ip = ip
    token.click_user_agent = user_agent
    token.save(update_fields=["clicked_at", "click_ip", "click_user_agent"])

    if not application.verification_code_confirmed_at:
        application.verification_code_confirmed_at = now
        application.verification_code_channel = TenantOnboardingApplication.VerificationChannel.EMAIL_LINK
        application.verification_code_note = (
            f"One-click email verification (token {token.id}, IP {ip or 'unknown'})"
        )
        application.save(
            update_fields=[
                "verification_code_confirmed_at",
                "verification_code_channel",
                "verification_code_note",
                "updated_at",
            ]
        )

    return application
