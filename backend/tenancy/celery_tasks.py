"""Celery tasks for workshop onboarding emails."""
from __future__ import annotations

from celery import shared_task


@shared_task(bind=True, max_retries=3, default_retry_delay=60)
def send_onboarding_application_received_email_task(self, application_id: str):
    from .onboarding_emails import send_onboarding_application_received_email

    try:
        return send_onboarding_application_received_email(application_id)
    except Exception as exc:
        raise self.retry(exc=exc) from exc


@shared_task(bind=True, max_retries=3, default_retry_delay=60)
def send_onboarding_application_approved_email_task(self, application_id: str):
    from .onboarding_emails import send_onboarding_application_approved_email

    try:
        return send_onboarding_application_approved_email(application_id)
    except Exception as exc:
        raise self.retry(exc=exc) from exc


@shared_task(bind=True, max_retries=3, default_retry_delay=60)
def send_onboarding_application_rejected_email_task(self, application_id: str):
    from .onboarding_emails import send_onboarding_application_rejected_email

    try:
        return send_onboarding_application_rejected_email(application_id)
    except Exception as exc:
        raise self.retry(exc=exc) from exc
