"""
Tests for tenant team management and mechanic listing APIs.
"""
from __future__ import annotations

from django.contrib.auth import get_user_model
from django.urls import reverse
from rest_framework import status
from rest_framework.test import APITestCase

from tenancy.models import WorkshopTenant

User = get_user_model()


class TenantTeamApiTests(APITestCase):
    def setUp(self):
        self.tenant = WorkshopTenant.objects.create(
            schema_name="teamshop",
            name="Team Shop",
            language="sq",
            currency="EUR",
        )
        self.admin = User.objects.create_user(
            username="team_admin",
            email="admin@teamshop.com",
            password="adminpass123",
            role=User.Role.ADMIN,
            tenant=self.tenant,
        )
        self.other_admin = User.objects.create_user(
            username="team_admin2",
            email="admin2@teamshop.com",
            password="adminpass123",
            role=User.Role.ADMIN,
            tenant=self.tenant,
        )
        self.mechanic = User.objects.create_user(
            username="team_mech",
            email="mech@teamshop.com",
            password="mechpass123",
            role=User.Role.MECHANIC,
            tenant=self.tenant,
            first_name="Ali",
            last_name="Krasniqi",
        )
        self.users_url = reverse("tenant-users-list")
        self.mechanics_url = reverse("auth_tenant_mechanics")

    def test_admin_lists_tenant_users(self):
        self.client.force_authenticate(user=self.admin)
        response = self.client.get(self.users_url)

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        usernames = {row["username"] for row in response.data}
        self.assertIn("team_admin", usernames)
        self.assertIn("team_mech", usernames)

    def test_mechanic_cannot_manage_team(self):
        self.client.force_authenticate(user=self.mechanic)
        response = self.client.get(self.users_url)

        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_admin_creates_mechanic(self):
        self.client.force_authenticate(user=self.admin)
        response = self.client.post(
            self.users_url,
            {
                "username": "new_mech",
                "email": "new@teamshop.com",
                "first_name": "New",
                "last_name": "Mechanic",
                "role": User.Role.MECHANIC,
                "password": "newpass123",
            },
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        created = User.objects.get(username="new_mech")
        self.assertEqual(created.tenant_id, self.tenant.id)
        self.assertEqual(created.role, User.Role.MECHANIC)

    def test_admin_deactivates_user(self):
        self.client.force_authenticate(user=self.admin)
        detail_url = reverse("tenant-users-detail", kwargs={"pk": self.mechanic.id})
        response = self.client.patch(detail_url, {"is_active": False}, format="json")

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.mechanic.refresh_from_db()
        self.assertFalse(self.mechanic.is_active)

    def test_admin_promotes_mechanic_to_admin(self):
        self.client.force_authenticate(user=self.admin)
        detail_url = reverse("tenant-users-detail", kwargs={"pk": self.mechanic.id})
        response = self.client.patch(detail_url, {"role": User.Role.ADMIN}, format="json")

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.mechanic.refresh_from_db()
        self.assertEqual(self.mechanic.role, User.Role.ADMIN)

    def test_admin_cannot_demote_last_admin(self):
        self.client.force_authenticate(user=self.admin)
        detail_url = reverse("tenant-users-detail", kwargs={"pk": self.admin.id})
        response = self.client.patch(detail_url, {"role": User.Role.MECHANIC}, format="json")

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.admin.refresh_from_db()
        self.assertEqual(self.admin.role, User.Role.ADMIN)

    def test_admin_demotes_admin_when_another_admin_exists(self):
        self.client.force_authenticate(user=self.admin)
        detail_url = reverse("tenant-users-detail", kwargs={"pk": self.other_admin.id})
        response = self.client.patch(detail_url, {"role": User.Role.MECHANIC}, format="json")

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.other_admin.refresh_from_db()
        self.assertEqual(self.other_admin.role, User.Role.MECHANIC)

    def test_admin_lists_active_mechanics(self):
        self.client.force_authenticate(user=self.admin)
        response = self.client.get(self.mechanics_url)

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(len(response.data), 1)
        self.assertEqual(response.data[0]["username"], "team_mech")

    def test_mechanic_cannot_list_mechanics_endpoint(self):
        self.client.force_authenticate(user=self.mechanic)
        response = self.client.get(self.mechanics_url)

        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)
