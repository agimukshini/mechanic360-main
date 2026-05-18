"""
ViewSet mixins for role-based access within a tenant schema.
"""
from __future__ import annotations

from mechanic360.permissions import IsAdvisorOrAdmin, IsAdvisorOrAdminOrReadOnly, IsTenantUser


class DestroyRequiresAdvisorMixin:
    """Only advisors and admins may DELETE."""

    def get_permissions(self):
        if getattr(self, "action", None) == "destroy":
            return [IsAdvisorOrAdmin()]
        return [IsTenantUser()]


class AdvisorWriteMixin:
    """Mechanics: read-only. Advisors/admins: full CRUD."""

    def get_permissions(self):
        return [IsAdvisorOrAdminOrReadOnly()]
