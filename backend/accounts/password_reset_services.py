"""Password reset link creation and redemption."""
from __future__ import annotations

from django.contrib.auth import get_user_model
from django.db import transaction
from django.utils import timezone
from rest_framework.exceptions import ValidationError

from mechanic360.email_service import frontend_base_url

from .password_reset_models import PasswordResetToken

User = get_user_model()


def _frontend_url() -> str:
    return frontend_base_url()


def password_reset_path(token_id) -> str:
    return f"/reset-password/{token_id}"


def password_reset_absolute_url(token_id) -> str:
    return f"{_frontend_url()}{password_reset_path(token_id)}"


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


def request_password_reset(*, email: str, request=None) -> PasswordResetToken | None:
    """Create a reset token for an active user with this email, or return None."""
    cleaned = (email or "").strip()
    if not cleaned:
        return None
    user = User.objects.filter(email__iexact=cleaned, is_active=True).first()
    if user is None:
        return None
    PasswordResetToken.objects.filter(user=user, used_at__isnull=True).update(
        used_at=timezone.now()
    )
    return PasswordResetToken.objects.create(
        user=user,
        expires_at=PasswordResetToken.default_expiry(),
        request_ip=_client_ip(request),
    )


def get_password_reset_token(token_id: str) -> PasswordResetToken:
    try:
        return PasswordResetToken.objects.select_related("user").get(id=token_id)
    except (PasswordResetToken.DoesNotExist, ValueError) as exc:
        raise ValidationError("Password reset link is invalid or no longer available.") from exc


def password_reset_preview(token: PasswordResetToken) -> dict:
    status = "valid"
    if token.used_at is not None:
        status = "used"
    elif token.expires_at <= timezone.now():
        status = "expired"
    elif not token.user.is_active:
        status = "inactive"
    return {
        "token_id": str(token.id),
        "status": status,
        "email": token.user.email,
        "username": token.user.username,
        "expires_at": token.expires_at,
    }


@transaction.atomic
def reset_password_with_token(
    *,
    token_id: str,
    password: str,
    request=None,
) -> User:
    token = get_password_reset_token(token_id)
    if token.used_at is not None:
        raise ValidationError("This password reset link has already been used.")
    if token.expires_at <= timezone.now():
        raise ValidationError("This password reset link has expired.")
    if not token.user.is_active:
        raise ValidationError("This account is inactive.")

    user = token.user
    user.set_password(password)
    user.save(update_fields=["password"])

    token.used_at = timezone.now()
    token.reset_ip = _client_ip(request)
    token.reset_user_agent = _client_user_agent(request)
    token.save(update_fields=["used_at", "reset_ip", "reset_user_agent"])

    return user
