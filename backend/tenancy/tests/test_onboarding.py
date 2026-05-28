"""
Tests for tenant onboarding approval flow.
"""
from __future__ import annotations

from django.contrib.auth import get_user_model
from django.conf import settings
from django.test import TestCase, override_settings
from django.urls import reverse
from rest_framework import status
from rest_framework.test import APIClient
from unittest.mock import patch

from tenancy.models import TenantOnboardingApplication, WorkshopTenant
from tenancy.views import TenantRegisterView

User = get_user_model()


@override_settings(
    CACHES={
        "default": {
            "BACKEND": "django.core.cache.backends.dummy.DummyCache",
        }
    },
    REST_FRAMEWORK={
        **settings.REST_FRAMEWORK,
        "DEFAULT_THROTTLE_RATES": {
            **settings.REST_FRAMEWORK["DEFAULT_THROTTLE_RATES"],
            "registration": "10000/hour",
            "auth": "10000/hour",
        },
    },
)
class TenantOnboardingTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.register_url = reverse("tenant_register")
        self.payload = {
            "workshop_name": "Alpha Garage",
            "admin_username": "alpha_admin",
            "admin_email": "alpha@example.com",
            "admin_password": "securepass123",
        }
        self.superuser = User.objects.create_superuser(
            username="platform_admin",
            email="admin@example.com",
            password="superpass123",
        )

    def _submit_registration(self, payload=None):
        payload = payload or self.payload
        with patch.object(TenantRegisterView, "throttle_classes", []):
            return self.client.post(self.register_url, payload, format="json")

    def test_registration_creates_pending_application(self):
        response = self._submit_registration()

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(response.data["status"], "pending")
        self.assertFalse(WorkshopTenant.objects.filter(name="Alpha Garage").exists())
        self.assertFalse(User.objects.filter(username="alpha_admin").exists())

        application = TenantOnboardingApplication.objects.get()
        self.assertEqual(application.status, TenantOnboardingApplication.Status.PENDING)

    def test_superuser_can_approve_application(self):
        self._submit_registration()
        application = TenantOnboardingApplication.objects.get()

        self.client.force_authenticate(user=self.superuser)
        approve_url = reverse(
            "admin-onboarding-applications-approve",
            kwargs={"pk": application.id},
        )
        response = self.client.post(approve_url, format="json")

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        application.refresh_from_db()
        self.assertEqual(application.status, TenantOnboardingApplication.Status.APPROVED)
        self.assertIsNotNone(application.tenant_id)
        self.assertTrue(User.objects.filter(username="alpha_admin", tenant=application.tenant).exists())

    def test_superuser_can_reject_application(self):
        self._submit_registration()
        application = TenantOnboardingApplication.objects.get()

        self.client.force_authenticate(user=self.superuser)
        reject_url = reverse(
            "admin-onboarding-applications-reject",
            kwargs={"pk": application.id},
        )
        response = self.client.post(reject_url, {"reason": "Incomplete details"}, format="json")

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        application.refresh_from_db()
        self.assertEqual(application.status, TenantOnboardingApplication.Status.REJECTED)
        self.assertEqual(application.rejection_reason, "Incomplete details")
        self.assertFalse(WorkshopTenant.objects.filter(name="Alpha Garage").exists())

    def test_non_superuser_cannot_review_applications(self):
        self._submit_registration()
        application = TenantOnboardingApplication.objects.get()
        regular_user = User.objects.create_user(
            username="regular",
            email="regular@example.com",
            password="pass12345",
        )

        self.client.force_authenticate(user=regular_user)
        list_url = reverse("admin-onboarding-applications-list")
        response = self.client.get(list_url)

        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

        approve_url = reverse(
            "admin-onboarding-applications-approve",
            kwargs={"pk": application.id},
        )
        response = self.client.post(approve_url, format="json")
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_pending_username_blocks_duplicate_registration(self):
        self._submit_registration()
        duplicate_payload = {
            **self.payload,
            "admin_email": "other@example.com",
        }
        response = self._submit_registration(duplicate_payload)

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("admin_username", response.data)

    def test_approved_user_can_login_after_approval(self):
        self._submit_registration()
        application = TenantOnboardingApplication.objects.get()

        self.client.force_authenticate(user=self.superuser)
        approve_url = reverse(
            "admin-onboarding-applications-approve",
            kwargs={"pk": application.id},
        )
        self.client.post(approve_url, format="json")
        self.client.force_authenticate(user=None)

        login_response = self.client.post(
            reverse("token_obtain_pair"),
            {"username": "alpha_admin", "password": "securepass123"},
            format="json",
        )
        self.assertEqual(login_response.status_code, status.HTTP_200_OK)

    def test_inactive_tenant_cannot_login(self):
        self._submit_registration()
        application = TenantOnboardingApplication.objects.get()

        self.client.force_authenticate(user=self.superuser)
        approve_url = reverse(
            "admin-onboarding-applications-approve",
            kwargs={"pk": application.id},
        )
        self.client.post(approve_url, format="json")
        application.refresh_from_db()
        application.tenant.is_active = False
        application.tenant.save()
        self.client.force_authenticate(user=None)

        login_response = self.client.post(
            reverse("token_obtain_pair"),
            {"username": "alpha_admin", "password": "securepass123"},
            format="json",
        )
        self.assertEqual(login_response.status_code, status.HTTP_401_UNAUTHORIZED)
