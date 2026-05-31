"""Tests for one-time staff invite links."""
from __future__ import annotations

from datetime import timedelta

from unittest.mock import patch

from django.contrib.auth import get_user_model
from django.urls import reverse
from django.utils import timezone
from rest_framework import status
from rest_framework.test import APITestCase

from accounts.invite_models import StaffInviteToken
from tenancy.models import WorkshopTenant

User = get_user_model()


class StaffInviteApiTests(APITestCase):
    def setUp(self):
        self.tenant = WorkshopTenant.objects.create(
            schema_name="inviteshop",
            name="Invite Shop",
            language="en",
            currency="EUR",
        )
        self.admin = User.objects.create_user(
            username="invite_admin",
            email="admin@inviteshop.com",
            password="adminpass123",
            role=User.Role.ADMIN,
            tenant=self.tenant,
        )
        self.mechanic = User.objects.create_user(
            username="invite_mech",
            email="mech@inviteshop.com",
            password="mechpass123",
            role=User.Role.MECHANIC,
            tenant=self.tenant,
        )
        self.invites_url = reverse("auth_tenant_invites")

    def test_admin_creates_invite_link(self):
        self.client.force_authenticate(user=self.admin)
        with patch("accounts.invite_views.send_staff_invite_email_task.delay") as mock_delay:
            response = self.client.post(
                self.invites_url,
                {
                    "email": "new@inviteshop.com",
                    "first_name": "New",
                    "last_name": "Mechanic",
                    "role": User.Role.MECHANIC,
                },
                format="json",
                HTTP_ORIGIN="https://app.example.com",
            )

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertIn("invite_url", response.data)
        self.assertTrue(response.data["email_queued"])
        mock_delay.assert_called_once()
        self.assertIn("/invite/staff/", response.data["invite_url"])
        invite = StaffInviteToken.objects.get()
        self.assertIsNone(invite.used_at)
        self.assertGreater(invite.expires_at, timezone.now())

    def test_mechanic_cannot_create_invite(self):
        self.client.force_authenticate(user=self.mechanic)
        response = self.client.post(self.invites_url, {"role": User.Role.MECHANIC}, format="json")

        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_accept_invite_creates_user_once(self):
        invite = StaffInviteToken.objects.create(
            tenant=self.tenant,
            created_by=self.admin,
            email="join@inviteshop.com",
            first_name="Join",
            last_name="Me",
            role=User.Role.MECHANIC,
            expires_at=StaffInviteToken.default_expiry(),
        )
        accept_url = reverse("auth_staff_invite_accept", kwargs={"token_id": invite.id})
        payload = {
            "username": "joined_mech",
            "password": "joinedpass123",
            "email": "join@inviteshop.com",
        }

        response = self.client.post(accept_url, payload, format="json")
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertTrue(User.objects.filter(username="joined_mech", tenant=self.tenant).exists())

        invite.refresh_from_db()
        self.assertIsNotNone(invite.used_at)

        response = self.client.post(accept_url, payload, format="json")
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_expired_invite_cannot_be_accepted(self):
        invite = StaffInviteToken.objects.create(
            tenant=self.tenant,
            created_by=self.admin,
            role=User.Role.MECHANIC,
            expires_at=timezone.now() - timedelta(minutes=1),
        )
        accept_url = reverse("auth_staff_invite_accept", kwargs={"token_id": invite.id})
        response = self.client.post(
            accept_url,
            {"username": "late_user", "password": "latepass123"},
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_preview_shows_status(self):
        invite = StaffInviteToken.objects.create(
            tenant=self.tenant,
            created_by=self.admin,
            role=User.Role.MECHANIC,
            expires_at=StaffInviteToken.default_expiry(),
        )
        preview_url = reverse("auth_staff_invite_preview", kwargs={"token_id": invite.id})
        response = self.client.get(preview_url)

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["status"], "valid")
        self.assertEqual(response.data["workshop_name"], "Invite Shop")
        self.assertEqual(response.data["role"], User.Role.MECHANIC)

    def test_list_includes_limits(self):
        self.client.force_authenticate(user=self.admin)
        response = self.client.get(self.invites_url)

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertIn("limits", response.data)
        self.assertEqual(response.data["limits"]["daily_limit"], 3)
        self.assertEqual(response.data["limits"]["monthly_limit"], 10)

    def test_daily_invite_limit(self):
        self.client.force_authenticate(user=self.admin)
        for i in range(3):
            response = self.client.post(
                self.invites_url,
                {"role": User.Role.MECHANIC, "email": f"mech{i}@inviteshop.com"},
                format="json",
            )
            self.assertEqual(response.status_code, status.HTTP_201_CREATED)

        response = self.client.post(
            self.invites_url,
            {"role": User.Role.MECHANIC},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("Daily invite limit", str(response.data))

    def test_monthly_invite_limit(self):
        self.client.force_authenticate(user=self.admin)
        month_start = timezone.now().replace(day=1, hour=0, minute=0, second=0, microsecond=0)
        for i in range(10):
            token = StaffInviteToken.objects.create(
                tenant=self.tenant,
                created_by=self.admin,
                role=User.Role.MECHANIC,
                expires_at=StaffInviteToken.default_expiry(),
            )
            StaffInviteToken.objects.filter(pk=token.pk).update(
                created_at=month_start + timedelta(hours=i)
            )

        response = self.client.post(
            self.invites_url,
            {"role": User.Role.MECHANIC},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("Monthly invite limit", str(response.data))
