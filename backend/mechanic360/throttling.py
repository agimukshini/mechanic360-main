"""
Rate limiting for sensitive public endpoints.
"""
from __future__ import annotations

from rest_framework.throttling import AnonRateThrottle, UserRateThrottle


class AuthAnonRateThrottle(AnonRateThrottle):
    scope = "auth"


class RegistrationAnonRateThrottle(AnonRateThrottle):
    scope = "registration"


class BurstUserRateThrottle(UserRateThrottle):
    scope = "user_burst"
