"""
ViewSet mixins for role-based access within a tenant schema.
"""
from __future__ import annotations

from django.contrib.auth import get_user_model
from rest_framework.exceptions import PermissionDenied

from mechanic360.permissions import IsAdvisorOrAdmin, IsAdvisorOrAdminOrReadOnly, IsTenantUser

User = get_user_model()


class DestroyRequiresAdvisorMixin:
    """Only advisors and admins may DELETE."""

    def get_permissions(self):
        if getattr(self, "action", None) == "destroy":
            return [IsAdvisorOrAdmin()]
        return super().get_permissions()


class AdvisorWriteMixin:
    """Mechanics: read-only. Advisors/admins: full CRUD."""

    def get_permissions(self):
        return [IsAdvisorOrAdminOrReadOnly()]


class MechanicReadOnlyMixin:
    """Mechanics may list/retrieve; advisors and admins may write."""

    def get_permissions(self):
        if getattr(self, "action", None) in {"create", "update", "partial_update", "destroy"}:
            return [IsAdvisorOrAdmin()]
        return [IsTenantUser()]


class VisitAdvisorActionsMixin:
    """Only advisors/admins may create or change visit headers and lifecycle."""

    advisor_only_actions = frozenset(
        {
            "create",
            "update",
            "partial_update",
            "start_visit",
            "complete_visit",
            "finish_visit",
            "cancel_visit",
        }
    )

    def get_permissions(self):
        if getattr(self, "action", None) in self.advisor_only_actions:
            return [IsAdvisorOrAdmin()]
        return super().get_permissions()


class AdvisorWriteTenantReadMixin:
    """Tenant users read; only advisors/admins write (e.g. material lines)."""

    def get_permissions(self):
        from rest_framework import permissions

        if self.request.method in permissions.SAFE_METHODS:
            return [IsTenantUser()]
        return [IsAdvisorOrAdmin()]


class MechanicOwnWorkLineMixin:
    """Mechanics may only change or delete visit lines they performed."""

    performed_by_field = "performed_by"

    def _mechanic_may_modify_line(self, instance) -> bool:
        user = self.request.user
        if getattr(user, "role", None) != User.Role.MECHANIC:
            return True
        performer = getattr(instance, self.performed_by_field, None)
        return performer is not None and performer.id == user.id

    def perform_update(self, serializer):
        if not self._mechanic_may_modify_line(serializer.instance):
            raise PermissionDenied("Mechanics can only edit their own work lines.")
        serializer.save()

    def perform_destroy(self, instance):
        if not self._mechanic_may_modify_line(instance):
            raise PermissionDenied("Mechanics can only remove their own work lines.")
        instance.delete()
