"""
API views for 360° technical inspections.

These endpoints let workshops:
- record inspection results for a visit
- retrieve inspection history
"""
from __future__ import annotations

from rest_framework import viewsets, mixins
from rest_framework import filters as drf_filters
from django_filters.rest_framework import DjangoFilterBackend
from django_filters import rest_framework as django_filters

from vehicles.models import Inspection
from mechanic360.permissions import IsTenantUser

from .serializers import InspectionSerializer, CreateInspectionSerializer


class InspectionFilter(django_filters.FilterSet):
    vehicle = django_filters.UUIDFilter(field_name="visit__vehicle__id")
    visit = django_filters.UUIDFilter(field_name="visit__id")

    class Meta:
        model = Inspection
        fields = ["vehicle", "visit"]


class InspectionViewSet(
    mixins.ListModelMixin,
    mixins.RetrieveModelMixin,
    mixins.CreateModelMixin,
    mixins.UpdateModelMixin,
    viewsets.GenericViewSet,
):
    """
    List, retrieve, create and update inspections.

    Deletion is not exposed by default to preserve service history integrity.
    """

    queryset = Inspection.objects.select_related("visit", "visit__vehicle").all()
    permission_classes = [IsTenantUser]
    # Must include DjangoFilterBackend — overriding DEFAULT_FILTER_BACKENDS drops it otherwise.
    filter_backends = [DjangoFilterBackend, drf_filters.OrderingFilter]
    filterset_class = InspectionFilter
    ordering_fields = ["performed_at"]
    ordering = ["-performed_at"]

    def get_serializer_class(self):
        if self.action in {"create", "update", "partial_update"}:
            return CreateInspectionSerializer
        return InspectionSerializer


