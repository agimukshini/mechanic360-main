from __future__ import annotations

from rest_framework.routers import DefaultRouter

from .transfer_views import WorkshopTransferViewSet
from .views import GlobalVehicleViewSet

router = DefaultRouter()
router.register(r"transfers", WorkshopTransferViewSet, basename="workshop-transfer")
router.register(r"", GlobalVehicleViewSet, basename="global-vehicle")

urlpatterns = router.urls
