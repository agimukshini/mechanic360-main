"""
Router for inventory APIs.

Exposed endpoints under `/api/v1/inventory/` (see project root
`mechanic360/urls.py` which already includes this module).
"""
from __future__ import annotations

from rest_framework.routers import DefaultRouter

from .views import InventoryItemViewSet

router = DefaultRouter()
router.register(r"items", InventoryItemViewSet, basename="inventory-item")

urlpatterns = router.urls
