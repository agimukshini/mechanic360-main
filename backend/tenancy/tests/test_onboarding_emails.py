"""Tests for onboarding and staff invite branded emails."""
from __future__ import annotations

from unittest.mock import patch

from django.contrib.auth import get_user_model
from django.core import mail
from django.test import TestCase, override_settings

from accounts.invite_emails import send_staff_invite_email
from accounts.invite_models import StaffInviteToken
from global_vehicles.models import PlatformIssuerProfile
from tenancy.models import TenantOnboardingApplication, WorkshopTenant
from tenancy.onboarding_emails import (
    send_onboarding_application_approved_email,
    send_onboarding_application_received_email,
    send_onboarding_application_rejected_email,
)

User = get_user_model()


@override_settings(
    EMAIL_BACKEND="django.core.mail.backends.locmem.EmailBackend",
    FRONTEND_BASE_URL="https://mekaniku360.com",
)
class OnboardingEmailTests(TestCase):
    def setUp(self):
        profile = PlatformIssuerProfile.load()
        profile.company_name = "Mechanic360 Platform"
        profile.email = "onboarding@mechanic360.com"
        profile.phone = "+383 38 000 000"
        profile.save()

        self.application = TenantOnboardingApplication.objects.create(
            workshop_name="Alpha Garage SH.P.K.",
            business_registration_number="811234567",
            address="Rr. Agim Ramadani 10, Prishtinë",
            contact_email="info@alphagarage.com",
            contact_phone="+383 44 123 456",
            admin_username="alpha_admin",
            admin_email="alpha@example.com",
            admin_password_hash="hashed",
            verification_code="A1B2C3D4",
            status=TenantOnboardingApplication.Status.PENDING,
        )

    def test_application_received_email_includes_kyc_and_verification_code(self):
        result = send_onboarding_application_received_email(str(self.application.id))

        self.assertEqual(result["sent"], 1)
        self.assertEqual(len(mail.outbox), 1)
        message = mail.outbox[0]
        self.assertEqual(message.to, ["alpha@example.com", "info@alphagarage.com"])
        self.assertIn("A1B2C3D4", message.body)
        self.assertIn("811234567", message.body)
        self.assertIn("Alpha Garage SH.P.K.", message.body)
        self.assertIn("mekaniku360@scardustech.com", message.body)
        html_body = message.alternatives[0][0]
        self.assertIn("A1B2C3D4", html_body)

    def test_application_approved_email_includes_login_details(self):
        tenant = WorkshopTenant.objects.create(
            schema_name="alpha_garage",
            name=self.application.workshop_name,
            business_registration_number=self.application.business_registration_number,
        )
        self.application.status = TenantOnboardingApplication.Status.APPROVED
        self.application.tenant = tenant
        self.application.save()

        result = send_onboarding_application_approved_email(str(self.application.id))

        self.assertEqual(result["sent"], 1)
        message = mail.outbox[0]
        self.assertIn("alpha_admin", message.body)
        self.assertIn("/login", message.body)
        self.assertIn("password you set during registration", message.body)

    def test_application_rejected_email_includes_reason(self):
        self.application.status = TenantOnboardingApplication.Status.REJECTED
        self.application.rejection_reason = "Could not verify business phone."
        self.application.save()

        result = send_onboarding_application_rejected_email(str(self.application.id))

        self.assertEqual(result["sent"], 1)
        message = mail.outbox[0]
        self.assertIn("Could not verify business phone.", message.body)


@override_settings(
    EMAIL_BACKEND="django.core.mail.backends.locmem.EmailBackend",
    FRONTEND_BASE_URL="https://mekaniku360.com",
)
class StaffInviteEmailTests(TestCase):
    def setUp(self):
        self.tenant = WorkshopTenant.objects.create(
            schema_name="invite_shop",
            name="Invite Shop",
        )
        self.admin = User.objects.create_user(
            username="shop_admin",
            email="admin@inviteshop.com",
            password="adminpass123",
            role=User.Role.ADMIN,
            tenant=self.tenant,
            first_name="Shop",
            last_name="Admin",
        )

    def test_staff_invite_email_contains_accept_link(self):
        invite = StaffInviteToken.objects.create(
            tenant=self.tenant,
            created_by=self.admin,
            email="mechanic@inviteshop.com",
            first_name="New",
            last_name="Mechanic",
            role=User.Role.MECHANIC,
            expires_at=StaffInviteToken.default_expiry(),
        )

        result = send_staff_invite_email(str(invite.id))

        self.assertEqual(result["sent"], 1)
        message = mail.outbox[0]
        self.assertEqual(message.to, ["mechanic@inviteshop.com"])
        self.assertIn(f"/invite/staff/{invite.id}", message.body)
        self.assertIn("Invite Shop", message.body)
        self.assertIn("Shop Admin", message.body)

    def test_staff_invite_without_email_is_skipped(self):
        invite = StaffInviteToken.objects.create(
            tenant=self.tenant,
            created_by=self.admin,
            role=User.Role.MECHANIC,
            expires_at=StaffInviteToken.default_expiry(),
        )

        result = send_staff_invite_email(str(invite.id))

        self.assertEqual(result["sent"], 0)
        self.assertEqual(len(mail.outbox), 0)


class OnboardingEmailTaskHookTests(TestCase):
    @patch("tenancy.views.send_onboarding_application_received_email_task.delay")
    def test_registration_queues_received_email(self, mock_delay):
        from django.urls import reverse
        from rest_framework.test import APIClient

        from tenancy.views import TenantRegisterView

        client = APIClient()
        payload = {
            "workshop_name": "Beta Garage SH.P.K.",
            "business_registration_number": "811234568",
            "address": "Rr. Nëna Terezë 5, Prishtinë",
            "contact_email": "info@betagarage.com",
            "contact_phone": "+383 44 999 888",
            "admin_username": "beta_admin",
            "admin_email": "beta@example.com",
            "admin_password": "securepass123",
        }
        with patch.object(TenantRegisterView, "throttle_classes", []):
            response = client.post(reverse("tenant_register"), payload, format="json")

        self.assertEqual(response.status_code, 201)
        mock_delay.assert_called_once()

    @patch("tenancy.onboarding.send_onboarding_application_approved_email_task.delay")
    def test_approval_queues_approved_email(self, mock_delay):
        from django.contrib.auth import get_user_model
        from django.urls import reverse
        from rest_framework.test import APIClient

        User = get_user_model()
        superuser = User.objects.create_superuser(
            username="platform_admin",
            email="admin@example.com",
            password="superpass123",
        )
        application = TenantOnboardingApplication.objects.create(
            workshop_name="Gamma Garage",
            business_registration_number="811234569",
            address="Address",
            contact_email="info@gamma.com",
            contact_phone="+38344111222",
            admin_username="gamma_admin",
            admin_email="gamma@example.com",
            admin_password_hash="hashed",
            verification_code="CODE1234",
            verification_code_confirmed_at=application_now(),
            status=TenantOnboardingApplication.Status.PENDING,
        )
        client = APIClient()
        client.force_authenticate(user=superuser)
        url = reverse("admin-onboarding-applications-approve", kwargs={"pk": application.id})
        response = client.post(url, format="json")

        self.assertEqual(response.status_code, 200)
        mock_delay.assert_called_once_with(str(application.id))


def application_now():
    from django.utils import timezone

    return timezone.now()
