"""
Shared helpers for username/password and PIN authentication.
"""
from __future__ import annotations

from django.contrib.auth import get_user_model

User = get_user_model()


def get_user_by_username_insensitive(username: str):
    """Resolve a user by username, ignoring letter case."""
    cleaned = (username or "").strip()
    if not cleaned:
        return None
    return User.objects.filter(username__iexact=cleaned).first()
