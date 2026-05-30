"""
Permission classes for the marketplace catalog API.
"""
from __future__ import annotations

from rest_framework import permissions
from rest_framework.request import Request
from rest_framework.views import APIView

from mechanic360.permissions import IsTenantAdmin

from .models import MarketplaceSeller, SparePart


class IsTenantAdminSellerOwner(permissions.BasePermission):
    """Tenant admin who owns the workshop seller profile for their tenant."""

    message = "Only your workshop admin can manage marketplace seller settings."

    def has_permission(self, request: Request, view: APIView) -> bool:
        if not IsTenantAdmin().has_permission(request, view):
            return False
        if request.method in permissions.SAFE_METHODS:
            return True
        return bool(request.user.tenant_id)

    def has_object_permission(self, request: Request, view: APIView, obj: MarketplaceSeller) -> bool:
        if request.method in permissions.SAFE_METHODS:
            return obj.tenant_id == request.user.tenant_id
        return obj.tenant_id == request.user.tenant_id


class IsSellerPartOwner(permissions.BasePermission):
    """Write access to spare parts owned by the user's workshop seller."""

    message = "You can only manage parts listed by your workshop."

    def has_object_permission(self, request: Request, view: APIView, obj: SparePart) -> bool:
        if request.method in permissions.SAFE_METHODS:
            return True
        seller = obj.seller
        return bool(
            seller.tenant_id
            and seller.tenant_id == getattr(request.user, "tenant_id", None)
        )
