"""Branded password reset emails."""
from __future__ import annotations

import uuid

from mechanic360.email_service import issuer_email_context, send_branded_email

from .password_reset_models import PasswordResetToken
from .password_reset_services import password_reset_absolute_url

User = None  # noqa: N816 — lazy import below


def _bilingual_subject() -> str:
    return "Mekaniku360 — Rivendos fjalëkalimin / Reset your password"


def send_password_reset_email(token_id: str) -> dict:
    token = PasswordResetToken.objects.select_related("user").get(pk=uuid.UUID(str(token_id)))
    recipient = (token.user.email or "").strip()
    if not recipient:
        return {"sent": 0, "recipients": []}

    name = token.user.first_name.strip() or token.user.username
    sent = send_branded_email(
        subject=_bilingual_subject(),
        to=[recipient],
        template_name="password_reset",
        context={
            **issuer_email_context(),
            "recipient_name": name,
            "username": token.user.username,
            "reset_url": password_reset_absolute_url(token.id),
            "expires_at": token.expires_at,
        },
    )
    return {"sent": sent, "recipients": [recipient]}
