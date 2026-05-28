"""
Celery tasks for accounts (login audit retention).
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
