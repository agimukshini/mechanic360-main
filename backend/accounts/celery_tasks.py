"""
Celery tasks for accounts (login audit retention, staff invite & password reset emails).
"""
from __future__ import annotations

from datetime import timedelta

from celery import shared_task
from django.conf import settings
from django.utils import timezone

from .login_audit_models import LoginAuditEvent


@shared_task(bind=True, max_retries=2)
def purge_old_login_audit_events(self):
    """
    Delete login audit rows older than LOGIN_AUDIT_RETENTION_DAYS (default 90).
    """
    retention_days = int(getattr(settings, "LOGIN_AUDIT_RETENTION_DAYS", 90))
    cutoff = timezone.now() - timedelta(days=retention_days)
    deleted, _ = LoginAuditEvent.objects.filter(created_at__lt=cutoff).delete()
    return {"deleted": deleted, "retention_days": retention_days}


@shared_task(bind=True, max_retries=3, default_retry_delay=60)
def send_staff_invite_email_task(self, invite_id: str):
    from .invite_emails import send_staff_invite_email

    try:
        return send_staff_invite_email(invite_id)
    except Exception as exc:
        raise self.retry(exc=exc) from exc


@shared_task(bind=True, max_retries=3, default_retry_delay=60)
def send_password_reset_email_task(self, token_id: str):
    from .password_reset_emails import send_password_reset_email

    try:
        return send_password_reset_email(token_id)
    except Exception as exc:
        raise self.retry(exc=exc) from exc
