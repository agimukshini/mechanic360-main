"""Tests for one-click onboarding verification and password reset."""
from __future__ import annotations

from django.contrib.auth import get_user_model
from django.core import mail
from django.test import TestCase, override_settings
from django.urls import reverse
from rest_framework import status
from rest_framework.test import APIClient

from accounts.password_reset_models import PasswordResetToken
from accounts.password_reset_services import request_password_reset, reset_password_with_token
from tenancy.models import OnboardingVerificationToken, TenantOnboardingApplication
from tenancy.verification_services import get_or_create_verification_token

User = get_user_model()


@override_settings(
    EMAIL_BACKEND="django.core.mail.backends.locmem.EmailBackend",
    FRONTEND_BASE_URL="https://mekaniku360.com",
)
class OnboardingVerificationLinkTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.application = TenantOnboardingApplication.objects.create(
            workshop_name="Alpha Garage",
            business_registration_number="811234567",
            address="Address",
            contact_email="info@alpha.com",
            contact_phone="+38344111222",
            admin_username="alpha_admin",
            admin_email="alpha@example.com",
            admin_password_hash="hashed",
            verification_code="ABCD1234",
            status=TenantOnboardingApplication.Status.PENDING,
        )
        self.token = get_or_create_verification_token(self.application)

    def test_confirm_records_audit_and_verification(self):
        confirm_url = reverse(
            "tenant_onboarding_verify_confirm",
            kwargs={"token_id": self.token.id},
        )
        response = self.client.post(
            confirm_url,
            format="json",
            REMOTE_ADDR="203.0.113.10",
            HTTP_USER_AGENT="TestBrowser/1.0",
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.application.refresh_from_db()
        self.token.refresh_from_db()
        self.assertIsNotNone(self.application.verification_code_confirmed_at)
        self.assertEqual(
            self.application.verification_code_channel,
            TenantOnboardingApplication.VerificationChannel.EMAIL_LINK,
        )
        self.assertIsNotNone(self.token.clicked_at)
        self.assertEqual(self.token.click_ip, "203.0.113.10")
        self.assertIn("TestBrowser", self.token.click_user_agent)

    def test_confirm_is_idempotent_when_already_verified(self):
        confirm_url = reverse(
            "tenant_onboarding_verify_confirm",
            kwargs={"token_id": self.token.id},
        )
        self.client.post(confirm_url, format="json")
        response = self.client.post(confirm_url, format="json")
        self.assertEqual(response.status_code, status.HTTP_200_OK)


@override_settings(
    EMAIL_BACKEND="django.core.mail.backends.locmem.EmailBackend",
    FRONTEND_BASE_URL="https://mekaniku360.com",
    CELERY_TASK_ALWAYS_EAGER=True,
)
class PasswordResetTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.user = User.objects.create_user(
            username="reset_user",
            email="reset@example.com",
            password="oldpass123",
        )

    def test_forgot_password_sends_email(self):
        url = reverse("auth_password_forgot")
        response = self.client.post(url, {"email": "reset@example.com"}, format="json")
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(len(mail.outbox), 1)
        self.assertIn("/reset-password/", mail.outbox[0].body)

    def test_request_and_reset_password(self):
        token = request_password_reset(email="reset@example.com")
        self.assertIsNotNone(token)
        from accounts.password_reset_emails import send_password_reset_email

        send_password_reset_email(str(token.id))
        self.assertEqual(len(mail.outbox), 1)
        self.assertIn("/reset-password/", mail.outbox[0].body)

        reset_password_with_token(
            token_id=str(token.id),
            password="newpass12345",
        )
        self.user.refresh_from_db()
        self.assertTrue(self.user.check_password("newpass12345"))

    def test_reset_api(self):
        token = PasswordResetToken.objects.create(
            user=self.user,
            expires_at=PasswordResetToken.default_expiry(),
        )
        url = reverse("auth_password_reset_confirm", kwargs={"token_id": token.id})
        response = self.client.post(
            url,
            {"password": "brandnew123", "confirm_password": "brandnew123"},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.user.refresh_from_db()
        self.assertTrue(self.user.check_password("brandnew123"))
