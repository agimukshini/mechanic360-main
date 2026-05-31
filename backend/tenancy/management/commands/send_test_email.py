"""Send a branded HTML test email (SMTP verification)."""
from __future__ import annotations

from django.core.management.base import BaseCommand, CommandError

from global_vehicles.issuer_services import issuer_snapshot_dict
from mechanic360.email_service import send_branded_email


class Command(BaseCommand):
    help = "Send a branded HTML test email to verify SMTP configuration."

    def add_arguments(self, parser):
        parser.add_argument("recipient", help="Recipient email address")
        parser.add_argument(
            "--name",
            default="Avni",
            help="Recipient first name for greeting",
        )

    def handle(self, *args, **options):
        recipient = options["recipient"].strip()
        if "@" not in recipient:
            raise CommandError("Invalid email address.")

        issuer = issuer_snapshot_dict()
        sent = send_branded_email(
            subject="Mekaniku360 — Email test SMTP / SMTP test & template preview",
            to=[recipient],
            template_name="test_branded",
            context={
                "recipient_name": options["name"],
                "verification_code": "A1B2C3D4",
                "issuer_name": issuer.get("display_name") or issuer.get("company_name") or "ScardusTech",
                "issuer_email": issuer.get("email") or "",
                "issuer_phone": issuer.get("phone") or "",
            },
        )
        if sent:
            self.stdout.write(self.style.SUCCESS(f"Test email sent to {recipient}"))
        else:
            raise CommandError("Email was not sent (send returned 0).")
