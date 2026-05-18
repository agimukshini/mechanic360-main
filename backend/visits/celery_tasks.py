"""
Celery tasks for preventive maintenance reminders.

Sends notifications via email, SMS, or WhatsApp when vehicles are due
for scheduled maintenance.
"""
from __future__ import annotations

from datetime import timedelta

from django.utils import timezone
from django.core.mail import send_mail
from django.conf import settings
from django.db.models import Q

from celery import shared_task

from vehicles.models import Vehicle
from visits.models import PreventiveMaintenancePlan


@shared_task(bind=True, max_retries=3)
def check_maintenance_due(self):
    """
    Check all active maintenance plans and send reminders for upcoming or overdue maintenance.

    This task runs daily via Celery Beat.
    """
    plans = PreventiveMaintenancePlan.objects.filter(is_active=True)
    reminders_sent = 0

    for plan in plans:
        try:
            # Calculate next due date/mileage
            next_due = calculate_next_due(plan)

            if not next_due:
                continue

            # Check if maintenance is due (within next 7 days or 500 km)
            is_due, reason = is_maintenance_due(plan, next_due)

            if is_due:
                # Send reminder notification
                send_maintenance_reminder(plan, reason)
                reminders_sent += 1

        except Exception as exc:
            # Retry on failure
            self.retry(exc=exc, countdown=60)

    return f"Checked {plans.count()} plans, sent {reminders_sent} reminders"


def calculate_next_due(plan: PreventiveMaintenancePlan) -> dict | None:
    """
    Calculate when the next maintenance is due based on the plan configuration.

    Returns a dict with next_due_date, next_due_mileage, or next_due_hours.
    """
    next_due = {}

    # KM-based
    if plan.interval_km and plan.last_mileage_km:
        next_due['mileage'] = plan.last_mileage_km + plan.interval_km

    # Hour-based
    if plan.interval_hours and plan.last_hours:
        next_due['hours'] = plan.last_hours + plan.interval_hours

    # Calendar-based
    if plan.interval_days and plan.last_service_date:
        from datetime import date
        next_due['date'] = plan.last_service_date + timedelta(days=plan.interval_days)

    return next_due if next_due else None


def is_maintenance_due(plan: PreventiveMaintenancePlan, next_due: dict) -> tuple[bool, str]:
    """
    Check if maintenance is due (within threshold).

    Returns (is_due, reason).
    """
    vehicle = plan.vehicle

    # Check mileage
    if 'mileage' in next_due:
        km_remaining = next_due['mileage'] - vehicle.odometer_km
        if km_remaining <= 500:  # Within 500 km
            if km_remaining <= 0:
                return True, f"Overdue by {abs(km_remaining)} km"
            return True, f"Due in {km_remaining} km"

    # Check hours
    if 'hours' in next_due:
        hours_remaining = next_due['hours'] - vehicle.hour_meter
        if hours_remaining <= 10:  # Within 10 hours
            if hours_remaining <= 0:
                return True, f"Overdue by {abs(hours_remaining)} hours"
            return True, f"Due in {hours_remaining} hours"

    # Check calendar
    if 'date' in next_due:
        days_remaining = (next_due['date'] - timezone.now().date()).days
        if days_remaining <= 7:  # Within 7 days
            if days_remaining <= 0:
                return True, f"Overdue by {abs(days_remaining)} days"
            return True, f"Due in {days_remaining} days"

    return False, ""


def send_maintenance_reminder(plan: PreventiveMaintenancePlan, reason: str):
    """
    Send maintenance reminder notification to vehicle owner.

    Sends via email (and optionally SMS/WhatsApp if configured).
    """
    vehicle = plan.vehicle
    owner = vehicle.owner

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
Workshop360
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
