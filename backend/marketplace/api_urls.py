"""
Router for marketplace APIs.

- /api/v1/marketplace/           -> List, create, retrieve, update, delete listings
"""
from __future__ import annotations

from rest_framework.routers import DefaultRouter

from .views import MarketplaceViewSet

router = DefaultRouter()
router.register(r"", MarketplaceViewSet, basename="marketplace")

urlpatterns = router.urls
