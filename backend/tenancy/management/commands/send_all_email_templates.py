"""Send all branded email templates to a recipient (preview / QA)."""
from __future__ import annotations

from datetime import timedelta

from django.core.management.base import BaseCommand, CommandError
from django.utils import timezone

from global_vehicles.issuer_services import issuer_snapshot_dict
from mechanic360.email_service import frontend_base_url, issuer_email_context, send_branded_email


class Command(BaseCommand):
    help = "Send all branded HTML email templates to a recipient for preview."

    def add_arguments(self, parser):
        parser.add_argument("recipient", help="Recipient email address")
        parser.add_argument("--name", default="Avni", help="Recipient first name")

    def handle(self, *args, **options):
        recipient = options["recipient"].strip()
        if "@" not in recipient:
            raise CommandError("Invalid email address.")

        name = options["name"]
        issuer = issuer_snapshot_dict()
        base_ctx = {
            **issuer_email_context(),
            "recipient_name": name,
            "issuer_name": issuer.get("display_name") or issuer.get("company_name") or "ScardusTech",
            "issuer_email": issuer.get("email") or "",
            "issuer_phone": issuer.get("phone") or "",
        }
        frontend = frontend_base_url()
        expires = timezone.now() + timedelta(hours=24)
        sample_token = "00000000-0000-4000-8000-000000000001"

        templates = [
            (
                "test_branded",
                "Mekaniku360 — [1/6] Email test SMTP / SMTP test",
                {
                    **base_ctx,
                    "verification_code": "A1B2C3D4",
                },
            ),
            (
                "onboarding_application_received",
                "Mekaniku360 — [2/6] Aplikimi u pranua / Application received",
                {
                    **base_ctx,
                    "workshop_name": "Alpha Garage SH.P.K.",
                    "business_registration_number": "811234567",
                    "address": "Rr. Agim Ramadani 10, Prishtinë",
                    "contact_email": "info@alphagarage.com",
                    "contact_phone": "+383 44 123 456",
                    "admin_username": "alpha_admin",
                    "admin_email": recipient,
                    "verification_code": "A1B2C3D4",
                    "verify_url": f"{frontend}/verify/onboarding/{sample_token}",
                    "verify_expires_at": expires,
                    "platform_contact_name": issuer.get("company_name") or "Mechanic360 Platform",
                    "platform_contact_email": issuer.get("email") or "onboarding@mechanic360.com",
                    "platform_contact_phone": issuer.get("phone") or "+383 38 000 000",
                    "login_url": f"{frontend}/login",
                },
            ),
            (
                "onboarding_application_approved",
                "Mekaniku360 — [3/6] Llogaria aktive / Account active",
                {
                    **base_ctx,
                    "workshop_name": "Alpha Garage SH.P.K.",
                    "business_registration_number": "811234567",
                    "address": "Rr. Agim Ramadani 10, Prishtinë",
                    "contact_email": "info@alphagarage.com",
                    "contact_phone": "+383 44 123 456",
                    "admin_username": "alpha_admin",
                    "admin_email": recipient,
                    "verification_code": "A1B2C3D4",
                    "verify_url": f"{frontend}/verify/onboarding/{sample_token}",
                    "tenant_schema_name": "alpha_garage",
                    "login_url": f"{frontend}/login",
                    "platform_contact_name": "",
                    "platform_contact_email": "",
                    "platform_contact_phone": "",
                },
            ),
            (
                "onboarding_application_rejected",
                "Mekaniku360 — [4/6] Përditësim aplikimi / Application update",
                {
                    **base_ctx,
                    "workshop_name": "Alpha Garage SH.P.K.",
                    "business_registration_number": "811234567",
                    "contact_phone": "+383 44 123 456",
                    "rejection_reason": "Nuk u verifikua numri zyrtar i telefonit. / Official phone could not be verified.",
                },
            ),
            (
                "staff_invite",
                "Mekaniku360 — [5/6] Ftesë mekanik / Staff invite",
                {
                    **base_ctx,
                    "workshop_name": "Alpha Garage SH.P.K.",
                    "invited_by": "Shop Admin",
                    "prefilled_email": recipient,
                    "invite_url": f"{frontend}/invite/staff/{sample_token}",
                    "expires_at": expires,
                },
            ),
            (
                "password_reset",
                "Mekaniku360 — [6/6] Rivendos fjalëkalimin / Reset password",
                {
                    **base_ctx,
                    "username": "alpha_admin",
                    "reset_url": f"{frontend}/reset-password/{sample_token}",
                    "expires_at": expires + timedelta(hours=1),
                },
            ),
        ]

        sent_count = 0
        for template_name, subject, context in templates:
            sent = send_branded_email(
                subject=subject,
                to=[recipient],
                template_name=template_name,
                context=context,
            )
            if sent:
                sent_count += 1
                self.stdout.write(self.style.SUCCESS(f"Sent {template_name}"))
            else:
                self.stdout.write(self.style.WARNING(f"Failed {template_name}"))

        if sent_count == len(templates):
            self.stdout.write(self.style.SUCCESS(f"All {sent_count} templates sent to {recipient}"))
        else:
            raise CommandError(f"Only {sent_count}/{len(templates)} emails sent.")
