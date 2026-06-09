"""
Tests for login audit logging and read APIs (Phase B).
"""
from __future__ import annotations

from datetime import timedelta
from unittest.mock import patch

from django.contrib.auth import get_user_model
from django.conf import settings
from django.test import override_settings
from django.urls import reverse
from django.utils import timezone
from rest_framework import status
from rest_framework.test import APITestCase

from accounts.login_audit_models import LoginAuditEvent
from tenancy.models import WorkshopTenant

User = get_user_model()


@override_settings(
    REST_FRAMEWORK={
        **settings.REST_FRAMEWORK,
        "DEFAULT_THROTTLE_RATES": {
            **settings.REST_FRAMEWORK["DEFAULT_THROTTLE_RATES"],
            "auth": "10000/hour",
        },
    },
)
class LoginAuditTests(APITestCase):
    def setUp(self):
        self.token_url = reverse("token_obtain_pair")
        self.pin_url = reverse("token_obtain_pin")
        self.tenant_audit_url = reverse("auth_login_audit")
        self.admin_audit_url = reverse("auth_admin_login_audit")

        self.tenant = WorkshopTenant.objects.create(
            schema_name="auditshop",
            name="Audit Shop",
            is_active=True,
        )
        self.admin = User.objects.create_user(
            username="audit_admin",
            email="admin@auditshop.com",
            password="pass12345",
            role=User.Role.ADMIN,
            tenant=self.tenant,
        )
        self.mechanic = User.objects.create_user(
            username="audit_mech",
            email="mech@auditshop.com",
            password="mechpass123",
            role=User.Role.MECHANIC,
            tenant=self.tenant,
        )
        self.superuser = User.objects.create_superuser(
            username="platform",
            email="platform@example.com",
            password="superpass123",
        )

    def test_successful_password_login_creates_audit_event(self):
        response = self.client.post(
            self.token_url,
            {"username": "audit_admin", "password": "pass12345"},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        event = LoginAuditEvent.objects.latest("created_at")
        self.assertEqual(event.outcome, LoginAuditEvent.Outcome.SUCCESS)
        self.assertEqual(event.auth_method, LoginAuditEvent.AuthMethod.PASSWORD)
        self.assertEqual(event.username_attempted, "audit_admin")
        self.assertEqual(event.user_id, self.admin.id)
        self.assertEqual(event.tenant_id, self.tenant.id)

    def test_password_login_is_case_insensitive_for_username(self):
        response = self.client.post(
            self.token_url,
            {"username": "AUDIT_ADMIN", "password": "pass12345"},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        event = LoginAuditEvent.objects.latest("created_at")
        self.assertEqual(event.outcome, LoginAuditEvent.Outcome.SUCCESS)
        self.assertEqual(event.user_id, self.admin.id)

    def test_password_login_remains_case_sensitive(self):
        response = self.client.post(
            self.token_url,
            {"username": "audit_admin", "password": "Pass12345"},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)
        event = LoginAuditEvent.objects.latest("created_at")
        self.assertEqual(event.outcome, LoginAuditEvent.Outcome.FAILED_PASSWORD)

    def test_pin_login_is_case_insensitive_for_username(self):
        self.mechanic.set_quick_pin("5678")
        self.mechanic.save()
        response = self.client.post(
            self.pin_url,
            {"username": "AUDIT_MECH", "pin": "5678"},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        event = LoginAuditEvent.objects.latest("created_at")
        self.assertEqual(event.outcome, LoginAuditEvent.Outcome.SUCCESS)
        self.assertEqual(event.user_id, self.mechanic.id)

    def test_failed_password_login_creates_audit_event(self):
        response = self.client.post(
            self.token_url,
            {"username": "audit_admin", "password": "wrong"},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)
        event = LoginAuditEvent.objects.latest("created_at")
        self.assertEqual(event.outcome, LoginAuditEvent.Outcome.FAILED_PASSWORD)
        self.assertEqual(event.username_attempted, "audit_admin")

    def test_unknown_user_login_creates_audit_event(self):
        response = self.client.post(
            self.token_url,
            {"username": "nobody_here", "password": "wrong"},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)
        event = LoginAuditEvent.objects.latest("created_at")
        self.assertEqual(event.outcome, LoginAuditEvent.Outcome.FAILED_UNKNOWN_USER)
        self.assertIsNone(event.user_id)

    def test_pin_login_success_after_pin_set(self):
        self.mechanic.set_quick_pin("5678")
        self.mechanic.save()
        response = self.client.post(
            self.pin_url,
            {"username": "audit_mech", "pin": "5678"},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        event = LoginAuditEvent.objects.latest("created_at")
        self.assertEqual(event.outcome, LoginAuditEvent.Outcome.SUCCESS)
        self.assertEqual(event.auth_method, LoginAuditEvent.AuthMethod.PIN)

    def test_tenant_admin_can_list_login_audit(self):
        LoginAuditEvent.objects.create(
            username_attempted="audit_mech",
            user=self.mechanic,
            tenant=self.tenant,
            outcome=LoginAuditEvent.Outcome.SUCCESS,
            auth_method=LoginAuditEvent.AuthMethod.PASSWORD,
        )
        self.client.force_authenticate(user=self.admin)
        response = self.client.get(self.tenant_audit_url)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        results = response.data.get("results") if isinstance(response.data, dict) else response.data
        self.assertEqual(len(results), 1)

    def test_mechanic_cannot_list_login_audit(self):
        self.client.force_authenticate(user=self.mechanic)
        response = self.client.get(self.tenant_audit_url)
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_superuser_can_list_all_login_audit(self):
        LoginAuditEvent.objects.create(
            username_attempted="audit_admin",
            user=self.admin,
            tenant=self.tenant,
            outcome=LoginAuditEvent.Outcome.SUCCESS,
            auth_method=LoginAuditEvent.AuthMethod.PASSWORD,
        )
        self.client.force_authenticate(user=self.superuser)
        response = self.client.get(self.admin_audit_url)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        results = response.data.get("results") if isinstance(response.data, dict) else response.data
        self.assertEqual(len(results), 1)

    def test_purge_task_deletes_old_events(self):
        old = LoginAuditEvent.objects.create(
            username_attempted="old",
            outcome=LoginAuditEvent.Outcome.SUCCESS,
            auth_method=LoginAuditEvent.AuthMethod.PASSWORD,
        )
        LoginAuditEvent.objects.filter(pk=old.pk).update(
            created_at=timezone.now() - timedelta(days=120)
        )
        LoginAuditEvent.objects.create(
            username_attempted="recent",
            outcome=LoginAuditEvent.Outcome.SUCCESS,
            auth_method=LoginAuditEvent.AuthMethod.PASSWORD,
        )
        from accounts.celery_tasks import purge_old_login_audit_events

        with patch("accounts.celery_tasks.settings.LOGIN_AUDIT_RETENTION_DAYS", 90):
            result = purge_old_login_audit_events()
        self.assertEqual(result["deleted"], 1)
        self.assertEqual(LoginAuditEvent.objects.count(), 1)
