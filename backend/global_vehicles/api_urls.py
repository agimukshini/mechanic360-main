from __future__ import annotations

from rest_framework.routers import DefaultRouter

from .photo_views import GlobalVehiclePhotoViewSet
from .pm_views import PreventiveMaintenanceOrderViewSet
from .transfer_views import WorkshopTransferViewSet
from .views import GlobalVehicleViewSet

router = DefaultRouter()
router.register(r"maintenance-orders", PreventiveMaintenanceOrderViewSet, basename="pm-order")
router.register(r"transfers", WorkshopTransferViewSet, basename="workshop-transfer")
# Cross-tenant photo gallery — readable by any tenant user, writable by the
# uploading tenant only. Registered before the catch-all so /photos/ doesn't
# get swallowed by the GlobalVehicleViewSet detail route.
router.register(r"photos", GlobalVehiclePhotoViewSet, basename="global-vehicle-photo")
router.register(r"", GlobalVehicleViewSet, basename="global-vehicle")

urlpatterns = router.urls
