"""
Router for client APIs.

Exposed endpoints under `/api/v1/clients/` (see project root
`mechanic360/urls.py` which already includes this module).
"""
from __future__ import annotations

from rest_framework.routers import DefaultRouter

from .views import ClientViewSet

router = DefaultRouter()
router.register(r"", ClientViewSet, basename="client")

urlpatterns = router.urls
