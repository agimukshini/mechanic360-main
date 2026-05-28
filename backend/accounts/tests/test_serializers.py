"""
Unit tests for account serializers.
"""
from __future__ import annotations

from django.contrib.auth import get_user_model
from django.test import SimpleTestCase

from accounts.serializers import RegisterSerializer

User = get_user_model()


class RegisterSerializerTests(SimpleTestCase):
    def test_role_field_defaults_to_mechanic(self):
        serializer = RegisterSerializer()
        self.assertEqual(serializer.fields["role"].default, User.Role.MECHANIC)
