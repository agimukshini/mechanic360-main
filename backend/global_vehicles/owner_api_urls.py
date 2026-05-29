from __future__ import annotations

from django.urls import path
from rest_framework.routers import DefaultRouter

from .owner_views import OwnerClaimPreviewView, OwnerClaimView, OwnerRegisterView, OwnerVehicleViewSet
from .transfer_views import OwnerTransferViewSet

router = DefaultRouter()
router.register(r"vehicles", OwnerVehicleViewSet, basename="owner-vehicle")
router.register(r"transfers", OwnerTransferViewSet, basename="owner-transfer")

urlpatterns = [
    path("register/", OwnerRegisterView.as_view(), name="owner-register"),
    path("vehicles/claim/", OwnerClaimView.as_view(), name="owner-claim"),
    path("vehicles/claim/preview/", OwnerClaimPreviewView.as_view(), name="owner-claim-preview"),
    *router.urls,
]
