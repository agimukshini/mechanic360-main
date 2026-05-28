"""
API viewsets for client management.

Tenants have full rights over their own registered clients.
Because we use schema-based multi-tenancy, each request is already scoped to
the current tenant's PostgreSQL schema; we simply require authentication here.
"""
from __future__ import annotations

from rest_framework import viewsets, filters

from mechanic360.mixins import DestroyRequiresAdvisorMixin, MechanicReadOnlyMixin
from mechanic360.permissions import IsTenantUser

from .models import Client
from .serializers import ClientSerializer


class ClientViewSet(DestroyRequiresAdvisorMixin, MechanicReadOnlyMixin, viewsets.ModelViewSet):
    """
    Full CRUD over clients for the current tenant.
    """

    queryset = Client.objects.all()
    serializer_class = ClientSerializer
    permission_classes = [IsTenantUser]

    filter_backends = [filters.SearchFilter, filters.OrderingFilter]
    search_fields = ["name", "company_name", "email", "phone"]
    ordering_fields = ["name", "created_at"]
    ordering = ["name"]
