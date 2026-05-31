"""Branded emails for workshop staff (mechanic) invite links."""
from __future__ import annotations

import uuid

from django.conf import settings

from mechanic360.email_service import frontend_base_url, issuer_email_context, send_branded_email

from .invite_models import StaffInviteToken
from .invite_services import staff_invite_path


def _frontend_url() -> str:
    return frontend_base_url()


def _inviter_display_name(user) -> str:
    if user is None:
        return "Administratori i punëtorisë suaj"
    full = f"{user.first_name} {user.last_name}".strip()
    return full or user.username


def _bilingual_subject(workshop_name: str) -> str:
    return (
        f"Mekaniku360 — Ftesë për {workshop_name} "
        f"/ Join {workshop_name} as a mechanic"
    )


def staff_invite_url(token_id) -> str:
    return f"{_frontend_url()}{staff_invite_path(token_id)}"


def send_staff_invite_email(invite_id: str) -> dict:
    invite = StaffInviteToken.objects.select_related("tenant", "created_by").get(
        pk=uuid.UUID(str(invite_id))
    )
    recipient = (invite.email or "").strip()
    if not recipient:
        return {"sent": 0, "recipients": []}

    recipient_name = invite.first_name.strip() or recipient.split("@", 1)[0]
    sent = send_branded_email(
        subject=_bilingual_subject(invite.tenant.name),
        to=[recipient],
        template_name="staff_invite",
        context={
            **issuer_email_context(),
            "frontend_url": _frontend_url(),
            "recipient_name": recipient_name,
            "workshop_name": invite.tenant.name,
            "invite_url": staff_invite_url(invite.id),
            "expires_at": invite.expires_at,
            "invited_by": _inviter_display_name(invite.created_by),
            "prefilled_email": invite.email,
            "prefilled_first_name": invite.first_name,
            "prefilled_last_name": invite.last_name,
        },
    )
    return {"sent": sent, "recipients": [recipient]}
