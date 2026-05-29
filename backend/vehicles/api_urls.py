"""
Router for vehicle APIs.

Exposed endpoints under `/api/v1/vehicles/` (see project root
`mechanic360/urls.py` which already includes this module).

Note: Client routes have been moved to clients.api_urls.
"""
from __future__ import annotations

from rest_framework.routers import DefaultRouter
from django.urls import path

from .views import VehicleDocumentViewSet, VehicleGalleryPhotoViewSet, VehicleViewSet
from visits.pdf_views import generate_service_booklet

router = DefaultRouter()
# Gallery routes must be registered BEFORE the catch-all "" so the router
# doesn't capture them as `/vehicles/<id>=photos`.
router.register(r"photos", VehicleGalleryPhotoViewSet, basename="vehicle-photo")
router.register(r"documents", VehicleDocumentViewSet, basename="vehicle-document")
router.register(r"", VehicleViewSet, basename="vehicle")

urlpatterns = router.urls + [
    path(
        "reports/service-booklet/<str:vehicle_id>/",
        generate_service_booklet,
        name="service-booklet",
    ),
]


