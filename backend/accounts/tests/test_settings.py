"""
Tests for user settings API (profile, password, preferences).

See working_scope/USER_PROFILE_MECHANICS_AND_AUDIT.md Phase A.
"""
from __future__ import annotations

from django.contrib.auth import get_user_model
from django.urls import reverse
from rest_framework import status
from rest_framework.test import APITestCase

from tenancy.models import WorkshopTenant

User = get_user_model()


class SettingsApiTests(APITestCase):
    def setUp(self):
        self.settings_url = reverse("auth_settings")
        self.tenant = WorkshopTenant.objects.create(
            schema_name="testshop",
            name="Test Shop",
            address="Old Street 1",
            contact_phone="+355111",
            contact_email="shop@example.com",
            language="sq",
            currency="EUR",
        )
        self.admin = User.objects.create_user(
            username="shop_admin",
            email="admin@example.com",
            password="oldpass123",
            role=User.Role.ADMIN,
            tenant=self.tenant,
            first_name="Ada",
            last_name="Min",
        )
        self.mechanic = User.objects.create_user(
            username="mechanic1",
            email="mech@example.com",
            password="mechpass123",
            role=User.Role.MECHANIC,
            tenant=self.tenant,
        )
        self.superuser = User.objects.create_superuser(
            username="platform",
            email="platform@example.com",
            password="superpass123",
        )

    def test_get_settings_includes_can_edit_workshop_for_admin(self):
        self.client.force_authenticate(user=self.admin)
        response = self.client.get(self.settings_url)

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertTrue(response.data["can_edit_workshop"])
        self.assertEqual(response.data["workshop_name"], "Test Shop")
        self.assertEqual(response.data["theme"], "light")

    def test_mechanic_cannot_edit_workshop_fields(self):
        self.client.force_authenticate(user=self.mechanic)
        response = self.client.patch(
            self.settings_url,
            {"workshop_address": "Hacker Lane"},
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.tenant.refresh_from_db()
        self.assertEqual(self.tenant.address, "Old Street 1")

    def test_admin_can_update_workshop_and_profile(self):
        self.client.force_authenticate(user=self.admin)
        response = self.client.patch(
            self.settings_url,
            {
                "first_name": "Alice",
                "phone": "+355 69 000 111",
                "workshop_address": "New Street 99",
                "language": "en",
                "currency": "USD",
                "theme": "dark",
                "email_notifications": False,
            },
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.admin.refresh_from_db()
        self.tenant.refresh_from_db()
        self.assertEqual(self.admin.first_name, "Alice")
        self.assertEqual(self.admin.phone, "+355 69 000 111")
        self.assertEqual(self.admin.theme, "dark")
        self.assertFalse(self.admin.email_notifications)
        self.assertEqual(self.tenant.address, "New Street 99")
        self.assertEqual(self.tenant.language, "en")
        self.assertEqual(self.tenant.currency, "USD")

    def test_password_change_success(self):
        self.client.force_authenticate(user=self.mechanic)
        response = self.client.patch(
            self.settings_url,
            {
                "current_password": "mechpass123",
                "password": "newpass456",
                "confirm_password": "newpass456",
            },
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.mechanic.refresh_from_db()
        self.assertTrue(self.mechanic.check_password("newpass456"))

    def test_password_change_wrong_current_password(self):
        self.client.force_authenticate(user=self.mechanic)
        response = self.client.patch(
            self.settings_url,
            {
                "current_password": "wrong",
                "password": "newpass456",
                "confirm_password": "newpass456",
            },
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("current_password", response.data)

    def test_password_change_mismatch_confirm(self):
        self.client.force_authenticate(user=self.mechanic)
        response = self.client.patch(
            self.settings_url,
            {
                "current_password": "mechpass123",
                "password": "newpass456",
                "confirm_password": "otherpass",
            },
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("confirm_password", response.data)

    def test_quick_pin_update(self):
        self.client.force_authenticate(user=self.mechanic)
        response = self.client.patch(
            self.settings_url,
            {
                "current_password": "mechpass123",
                "quick_pin": "4321",
                "confirm_quick_pin": "4321",
            },
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.mechanic.refresh_from_db()
        self.assertTrue(self.mechanic.check_quick_pin("4321"))

    def test_superuser_profile_without_workshop_block(self):
        self.client.force_authenticate(user=self.superuser)
        response = self.client.get(self.settings_url)

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertFalse(response.data["can_edit_workshop"])
        self.assertEqual(response.data["workshop_name"], "")

        patch_response = self.client.patch(
            self.settings_url,
            {"first_name": "Platform", "theme": "system"},
            format="json",
        )
        self.assertEqual(patch_response.status_code, status.HTTP_200_OK)
        self.superuser.refresh_from_db()
        self.assertEqual(self.superuser.first_name, "Platform")
        self.assertEqual(self.superuser.theme, "system")
