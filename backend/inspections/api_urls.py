"""
Router for inspection APIs.

- /api/v1/inspections/        -> list, create, retrieve, update inspections
- /api/v1/inspections/upload/ -> photo upload endpoint
"""
from __future__ import annotations

from rest_framework.routers import DefaultRouter
from django.urls import path

from .views import InspectionViewSet
from .upload_views import PhotoUploadView, delete_photo

router = DefaultRouter()
router.register(r"", InspectionViewSet, basename="inspections")

urlpatterns = router.urls + [
    path("upload/", PhotoUploadView.as_view(), name="photo-upload"),
    path("upload/<str:filename>/", delete_photo, name="photo-delete"),
]


