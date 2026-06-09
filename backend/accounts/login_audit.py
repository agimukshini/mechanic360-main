"""
Helpers to record login audit events from auth views.
"""
from __future__ import annotations

from django.contrib.auth import get_user_model

from .auth_utils import get_user_by_username_insensitive
from .login_audit_models import LoginAuditEvent

User = get_user_model()

USER_AGENT_MAX_LEN = 512


def get_client_ip(request) -> str | None:
    if request is None:
        return None
    forwarded = request.META.get("HTTP_X_FORWARDED_FOR")
    if forwarded:
        return forwarded.split(",")[0].strip()[:45] or None
    remote = request.META.get("REMOTE_ADDR")
    return remote[:45] if remote else None


def get_user_agent(request) -> str:
    if request is None:
        return ""
    raw = request.META.get("HTTP_USER_AGENT", "") or ""
    return raw[:USER_AGENT_MAX_LEN]


def classify_password_failure(username: str) -> str:
    user = get_user_by_username_insensitive(username)
    if user is None:
        return LoginAuditEvent.Outcome.FAILED_UNKNOWN_USER

    if not user.is_active:
        return LoginAuditEvent.Outcome.FAILED_INACTIVE

    tenant = getattr(user, "tenant", None)
    if tenant is not None and not tenant.is_active:
        return LoginAuditEvent.Outcome.FAILED_TENANT_INACTIVE

    return LoginAuditEvent.Outcome.FAILED_PASSWORD


def classify_pin_failure(username: str) -> str:
    user = get_user_by_username_insensitive(username)
    if user is None:
        return LoginAuditEvent.Outcome.FAILED_UNKNOWN_USER

    if not user.is_active:
        return LoginAuditEvent.Outcome.FAILED_INACTIVE

    tenant = getattr(user, "tenant", None)
    if tenant is not None and not tenant.is_active:
        return LoginAuditEvent.Outcome.FAILED_TENANT_INACTIVE

    if not user.has_quick_pin:
        return LoginAuditEvent.Outcome.FAILED_PIN

    return LoginAuditEvent.Outcome.FAILED_PIN


def is_inactive_tenant_message(detail: object) -> bool:
    text = str(detail).lower()
    return "workshop account is not active" in text or "inactive_tenant" in text


def record_login_attempt(
    request,
    *,
    username_attempted: str,
    outcome: str,
    auth_method: str,
    user=None,
) -> LoginAuditEvent:
    tenant = getattr(user, "tenant", None) if user is not None else None
    return LoginAuditEvent.objects.create(
        username_attempted=username_attempted[:150],
        user=user,
        tenant=tenant,
        outcome=outcome,
        auth_method=auth_method,
        ip_address=get_client_ip(request),
        user_agent=get_user_agent(request),
    )
