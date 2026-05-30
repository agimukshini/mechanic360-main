"""
Celery tasks for platform billing (subscription invoices).
"""
from __future__ import annotations

from celery import shared_task

from .invoice_services import process_due_subscription_invoices


@shared_task(bind=True, max_retries=3)
def issue_due_subscription_invoices(self):
    """
    Issue subscription invoices for tenants whose next charge date has passed.

    Runs daily via Celery Beat.
    """
    issued = process_due_subscription_invoices()
    return {"issued_count": len(issued)}


@shared_task(bind=True, max_retries=3)
def process_subscription_billing_reminders(self):
    """
    Send due/period-end warnings and suspend tenants after the grace period.

    Runs daily via Celery Beat.
    """
    from .subscription_reminder_services import process_subscription_billing_reminders

    return process_subscription_billing_reminders()
