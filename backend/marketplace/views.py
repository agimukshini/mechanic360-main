"""
API views for marketplace listings.

Marketplace is cross-tenant, so all authenticated users can view listings
from all workshops. Only the listing owner can create/update/delete.
"""
from __future__ import annotations

from rest_framework import permissions, viewsets, filters

from .models import MarketplaceListing
from .serializers import MarketplaceListingSerializer


class IsAuthenticatedOrReadOnly(permissions.BasePermission):
    """
    Authenticated users can create/update/delete.
    Anyone can read (list/retrieve).
    """

    def has_permission(self, request, view) -> bool:
        if request.method in permissions.SAFE_METHODS:
            return True
        return bool(request.user and request.user.is_authenticated)

    def has_object_permission(self, request, view, obj) -> bool:
        if request.method in permissions.SAFE_METHODS:
            return True
        # Only the listing owner can modify
        return obj.tenant == request.user.tenant


class MarketplaceViewSet(viewsets.ModelViewSet):
    """
    CRUD for marketplace listings.

    - List: All active listings from all tenants
    - Create: Only by authenticated users (linked to their tenant)
    - Update/Delete: Only by listing owner
    """

    queryset = MarketplaceListing.objects.select_related('tenant').filter(
        is_active=True, is_sold=False
    )
    serializer_class = MarketplaceListingSerializer
    permission_classes = [IsAuthenticatedOrReadOnly]

    filter_backends = [filters.SearchFilter, filters.OrderingFilter]
    search_fields = ['title', 'description', 'category', 'tenant__name']
    ordering_fields = ['created_at', 'price', 'title']
    ordering = ['-created_at']

    def perform_create(self, serializer):
        """
        Automatically link the listing to the current user's tenant.
        """
        serializer.save(tenant=self.request.user.tenant)

    def get_queryset(self):
        """
        Allow filtering by category and search terms.
        """
        queryset = super().get_queryset()

        # Filter by category if provided
        category = self.request.query_params.get('category')
        if category:
            queryset = queryset.filter(category=category)

        # Filter by address if provided
        address = self.request.query_params.get('address')
        if address:
            queryset = queryset.filter(tenant__address__icontains=address)

        return queryset
