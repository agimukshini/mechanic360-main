"""
Router for vehicle APIs.

Exposed endpoints under `/api/v1/vehicles/` (see project root
`mechanic360/urls.py` which already includes this module).

Note: Client routes have been moved to clients.api_urls.
"""
from __future__ import annotations

from rest_framework.routers import DefaultRouter
from django.urls import path

from .views import VehicleViewSet, VehicleDocumentViewSet
from visits.pdf_views import generate_service_booklet

router = DefaultRouter()
router.register(r"", VehicleViewSet, basename="vehicle")
router.register(r"documents", VehicleDocumentViewSet, basename="vehicle-document")

urlpatterns = router.urls + [
    path(
        "reports/service-booklet/<str:vehicle_id>/",
        generate_service_booklet,
        name="service-booklet",
    ),
]


