"""
Provision workshops after superuser approval of onboarding applications.
"""
from __future__ import annotations

from django.contrib.auth import get_user_model
from django.contrib.auth.hashers import make_password
from django.db import transaction
from django.utils import timezone
from django.utils.text import slugify
from rest_framework.exceptions import ValidationError

from .celery_tasks import (
    send_onboarding_application_approved_email_task,
    send_onboarding_application_rejected_email_task,
)
from .kyc import assert_nui_available
from .models import TenantOnboardingApplication, WorkshopTenant

User = get_user_model()


def _unique_schema_name(workshop_name: str) -> str:
    base_schema = slugify(workshop_name).replace("-", "_") or "tenant"
    schema_name = base_schema
    counter = 1
    while WorkshopTenant.objects.filter(schema_name=schema_name).exists():
        counter += 1
        schema_name = f"{base_schema}_{counter}"
    return schema_name


def _assert_username_available(username: str, *, exclude_application_id=None) -> None:
    if User.objects.filter(username=username).exists():
        raise ValidationError({"admin_username": "This username is already taken."})

    pending = TenantOnboardingApplication.objects.filter(
        admin_username=username,
        status=TenantOnboardingApplication.Status.PENDING,
    )
    if exclude_application_id:
        pending = pending.exclude(id=exclude_application_id)
    if pending.exists():
        raise ValidationError({"admin_username": "This username is already reserved by a pending application."})


def _assert_email_available(email: str, *, exclude_application_id=None) -> None:
    if User.objects.filter(email=email).exists():
        raise ValidationError({"admin_email": "An account with this email already exists."})

    pending = TenantOnboardingApplication.objects.filter(
        admin_email=email,
        status=TenantOnboardingApplication.Status.PENDING,
    )
    if exclude_application_id:
        pending = pending.exclude(id=exclude_application_id)
    if pending.exists():
        raise ValidationError({"admin_email": "This email is already reserved by a pending application."})


@transaction.atomic
def approve_onboarding_application(
    application: TenantOnboardingApplication,
    reviewer: User,
) -> WorkshopTenant:
    if application.status != TenantOnboardingApplication.Status.PENDING:
        raise ValidationError("Only pending applications can be approved.")

    _assert_username_available(application.admin_username, exclude_application_id=application.id)
    _assert_email_available(application.admin_email, exclude_application_id=application.id)
    if application.business_registration_number:
        assert_nui_available(
            application.business_registration_number,
            exclude_application_id=application.id,
        )

    if not application.verification_code_confirmed_at:
        raise ValidationError(
            "Confirm the applicant's verification code was received before approving."
        )

    tenant = WorkshopTenant.objects.create(
        name=application.workshop_name,
        schema_name=_unique_schema_name(application.workshop_name),
        business_registration_number=application.business_registration_number,
        address=application.address,
        contact_email=application.contact_email or application.admin_email,
        contact_phone=application.contact_phone,
        is_active=True,
    )

    admin_user = User(
        username=application.admin_username,
        email=application.admin_email,
        role=User.Role.ADMIN,
        tenant=tenant,
    )
    admin_user.password = application.admin_password_hash
    admin_user.save()

    application.status = TenantOnboardingApplication.Status.APPROVED
    application.tenant = tenant
    application.reviewed_by = reviewer
    application.reviewed_at = timezone.now()
    application.rejection_reason = ""
    application.save(
        update_fields=[
            "status",
            "tenant",
            "reviewed_by",
            "reviewed_at",
            "rejection_reason",
            "updated_at",
        ]
    )
    send_onboarding_application_approved_email_task.delay(str(application.id))
    return tenant


@transaction.atomic
def reject_onboarding_application(
    application: TenantOnboardingApplication,
    reviewer: User,
    *,
    reason: str = "",
) -> TenantOnboardingApplication:
    if application.status != TenantOnboardingApplication.Status.PENDING:
        raise ValidationError("Only pending applications can be rejected.")

    application.status = TenantOnboardingApplication.Status.REJECTED
    application.reviewed_by = reviewer
    application.reviewed_at = timezone.now()
    application.rejection_reason = reason.strip()
    application.save(
        update_fields=[
            "status",
            "reviewed_by",
            "reviewed_at",
            "rejection_reason",
            "updated_at",
        ]
    )
    send_onboarding_application_rejected_email_task.delay(str(application.id))
    return application


def hash_admin_password(raw_password: str) -> str:
    return make_password(raw_password)


@transaction.atomic
def confirm_onboarding_verification_code(
    application: TenantOnboardingApplication,
    reviewer: User,
    *,
    channel: str,
    note: str = "",
) -> TenantOnboardingApplication:
    if application.status != TenantOnboardingApplication.Status.PENDING:
        raise ValidationError("Only pending applications can be updated.")

    if application.verification_code_confirmed_at:
        raise ValidationError("Verification code was already confirmed for this application.")

    application.verification_code_confirmed_at = timezone.now()
    application.verification_code_confirmed_by = reviewer
    application.verification_code_channel = channel
    application.verification_code_note = note.strip()
    application.save(
        update_fields=[
            "verification_code_confirmed_at",
            "verification_code_confirmed_by",
            "verification_code_channel",
            "verification_code_note",
            "updated_at",
        ]
    )
    return application
