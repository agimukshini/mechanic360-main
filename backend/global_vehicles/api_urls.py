from __future__ import annotations

from rest_framework.routers import DefaultRouter

from .views import GlobalVehicleViewSet

router = DefaultRouter()
router.register(r"", GlobalVehicleViewSet, basename="global-vehicle")

urlpatterns = router.urls
