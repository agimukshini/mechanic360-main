"""
Shared DRF permission classes for Mechanic360.
"""
from __future__ import annotations

from django.contrib.auth import get_user_model
from rest_framework import permissions
from rest_framework.request import Request
from rest_framework.views import APIView

User = get_user_model()

STAFF_ROLES = frozenset({User.Role.ADMIN})


class IsOwnerUser(permissions.BasePermission):
    """Require an authenticated vehicle owner account (no workshop tenant)."""

    message = "This endpoint is for vehicle owner accounts only."

    def has_permission(self, request: Request, view: APIView) -> bool:
        user = request.user
        return bool(
            user
            and user.is_authenticated
            and getattr(user, "role", None) == User.Role.OWNER
        )


class IsTenantUser(permissions.BasePermission):
    """
    Require an authenticated user linked to a workshop tenant.

    Tenant isolation is enforced at the database/schema level by django-tenants.
    """

    message = "Your account is not linked to a workshop. Log in with a workshop user or contact support."

    def has_permission(self, request: Request, view: APIView) -> bool:
        user = request.user
        return bool(user and user.is_authenticated and user.tenant_id is not None)


class IsTenantAdmin(permissions.BasePermission):
    """Restrict access to workshop admins (tenant-scoped)."""

    def has_permission(self, request: Request, view: APIView) -> bool:
        user = request.user
        return bool(
            user
            and user.is_authenticated
            and getattr(user, "role", None) == User.Role.ADMIN
            and getattr(user, "tenant_id", None) is not None
        )


class IsAdvisorOrAdmin(permissions.BasePermission):
    """Workshop admin — catalog, inventory, deletes, analytics."""

    def has_permission(self, request: Request, view: APIView) -> bool:
        user = request.user
        if not user or not user.is_authenticated:
            return False
        return getattr(user, "role", None) in STAFF_ROLES


class IsAdvisorOrAdminOrReadOnly(permissions.BasePermission):
    """Mechanics may read; admins may write."""

    def has_permission(self, request: Request, view: APIView) -> bool:
        if not request.user or not request.user.is_authenticated:
            return False
        if request.method in permissions.SAFE_METHODS:
            return True
        return getattr(request.user, "role", None) in STAFF_ROLES


class IsPlatformSuperuser(permissions.BasePermission):
    """Platform superuser (Django is_superuser)."""

    message = "Platform superuser access required."

    def has_permission(self, request: Request, view: APIView) -> bool:
        user = request.user
        return bool(user and user.is_authenticated and user.is_superuser)
