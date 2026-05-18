"""
Tests for role-based permission classes.
"""
from __future__ import annotations

from django.contrib.auth import get_user_model
from django.test import RequestFactory, SimpleTestCase
from unittest.mock import Mock

from mechanic360.permissions import IsAdvisorOrAdmin, IsAdvisorOrAdminOrReadOnly

User = get_user_model()


class RolePermissionTests(SimpleTestCase):
    def setUp(self):
        self.factory = RequestFactory()
        self.view = Mock()

    def _request(self, method: str, role: str):
        request = self.factory.get("/") if method == "GET" else self.factory.post("/")
        request.method = method
        user = Mock()
        user.is_authenticated = True
        user.role = role
        request.user = user
        return request

    def test_advisor_or_admin_allows_admin(self):
        perm = IsAdvisorOrAdmin()
        self.assertTrue(perm.has_permission(self._request("POST", User.Role.ADMIN), self.view))

    def test_advisor_or_admin_denies_mechanic_on_post(self):
        perm = IsAdvisorOrAdmin()
        self.assertFalse(perm.has_permission(self._request("POST", User.Role.MECHANIC), self.view))

    def test_read_only_allows_mechanic_get(self):
        perm = IsAdvisorOrAdminOrReadOnly()
        self.assertTrue(perm.has_permission(self._request("GET", User.Role.MECHANIC), self.view))

    def test_read_only_denies_mechanic_post(self):
        perm = IsAdvisorOrAdminOrReadOnly()
        self.assertFalse(perm.has_permission(self._request("POST", User.Role.MECHANIC), self.view))
