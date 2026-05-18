"""
Unit tests for account serializers.
"""
from __future__ import annotations

from django.contrib.auth import get_user_model
from django.test import SimpleTestCase

from accounts.serializers import RegisterSerializer

User = get_user_model()


class RegisterSerializerTests(SimpleTestCase):
    def test_role_choices_exclude_admin(self):
        serializer = RegisterSerializer()
        role_field = serializer.fields["role"]
        choice_values = [c[0] for c in role_field.choices]
        self.assertIn(User.Role.MECHANIC, choice_values)
        self.assertIn(User.Role.SERVICE_ADVISOR, choice_values)
        self.assertNotIn(User.Role.ADMIN, choice_values)
