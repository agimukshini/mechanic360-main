"""
Celery tasks for preventive maintenance reminders.

Sends notifications via email, SMS, or WhatsApp when vehicles are due
for scheduled maintenance.
"""
from __future__ import annotations

from django.utils import timezone
from django.core.mail import send_mail
from django.conf import settings

from celery import shared_task
from django_tenants.utils import get_tenant_model, schema_context

from visits.maintenance_schedule import calculate_next_due, is_maintenance_due
from visits.models import PreventiveMaintenancePlan


@shared_task(bind=True, max_retries=3)
def check_maintenance_due(self):
    """
    Check all active maintenance plans and send reminders for upcoming or overdue maintenance.

    This task runs daily via Celery Beat.
    """
    Tenant = get_tenant_model()
    plans_checked = 0
    reminders_sent = 0

    for tenant in Tenant.objects.exclude(schema_name="public"):
        with schema_context(tenant.schema_name):
            plans = PreventiveMaintenancePlan.objects.filter(is_active=True).select_related(
                "vehicle",
                "vehicle__owner",
            )
            plans_checked += plans.count()
            for plan in plans:
                try:
                    next_due = calculate_next_due(plan)
                    if not next_due:
                        continue

                    is_due, reason = is_maintenance_due(plan, next_due)
                    if is_due:
                        send_maintenance_reminder(plan, reason)
                        reminders_sent += 1

                except Exception as exc:
                    self.retry(exc=exc, countdown=60)

    from global_vehicles.pm_services import sync_due_pm_orders_across_tenants

    pm_orders_synced = sync_due_pm_orders_across_tenants()

    return (
        f"Checked {plans_checked} plans, sent {reminders_sent} reminders, "
        f"synced {pm_orders_synced} PM work orders"
    )


def send_maintenance_reminder(plan: PreventiveMaintenancePlan, reason: str):
    """
    Send maintenance reminder notification to vehicle owner.

    Sends via email (and optionally SMS/WhatsApp if configured).
    """
    vehicle = plan.vehicle
    owner = vehicle.owner
    if owner is None:
        return

    # Prepare email
    subject = f"Maintenance Reminder: {plan.name} for {vehicle.license_plate}"
    message = f"""
Dear {owner.name or owner.company_name},

This is a reminder that your vehicle ({vehicle.make} {vehicle.model}, {vehicle.license_plate})
is due for scheduled maintenance:

Plan: {plan.name}
Reason: {reason}

Please contact your workshop to schedule the service.

Best regards,
Mechanic360
    """

    # Send email if owner has email
    if owner.email:
        try:
            send_mail(
                subject=subject,
                message=message,
                from_email=settings.DEFAULT_FROM_EMAIL,
                recipient_list=[owner.email],
                fail_silently=True,
            )
        except Exception:
            pass  # Log error in production

    # TODO: Send SMS/WhatsApp via Twilio if configured
    # if owner.phone and settings.TWILIO_ENABLED:
    #     send_sms_reminder(owner.phone, subject, message)
