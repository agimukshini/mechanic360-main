"""
Router for marketplace APIs.

Legacy listings (backward compatible):
  /api/v1/marketplace/           -> MarketplaceListing CRUD

Catalog (Phase A):
  /api/v1/marketplace/issues/
  /api/v1/marketplace/sellers/me/
  /api/v1/marketplace/parts/
  /api/v1/marketplace/admin/sellers/<id>/approve/
  /api/v1/marketplace/admin/parts/<id>/suspend/
"""
from __future__ import annotations

from django.urls import include, path
from rest_framework.routers import DefaultRouter

from .catalog_views import (
    AdminPartSuspendView,
    AdminSellerApproveView,
    BannerEventClickView,
    BannerEventContactView,
    PartCategoryListView,
    RecommendationView,
    SellerMeView,
    SparePartViewSet,
    VehicleIssueListView,
)
from .views import MarketplaceViewSet

legacy_router = DefaultRouter()
legacy_router.register(r"", MarketplaceViewSet, basename="marketplace")

parts_router = DefaultRouter()
parts_router.register(r"", SparePartViewSet, basename="marketplace-parts")

urlpatterns = [
    path("issues/", VehicleIssueListView.as_view(), name="marketplace-issues"),
    path("categories/", PartCategoryListView.as_view(), name="marketplace-categories"),
    path(
        "recommendations/",
        RecommendationView.as_view(),
        name="marketplace-recommendations",
    ),
    path(
        "banner-events/<uuid:event_id>/click/",
        BannerEventClickView.as_view(),
        name="marketplace-banner-click",
    ),
    path(
        "banner-events/<uuid:event_id>/contact/",
        BannerEventContactView.as_view(),
        name="marketplace-banner-contact",
    ),
    path("sellers/me/", SellerMeView.as_view(), name="marketplace-seller-me"),
    path(
        "admin/sellers/<uuid:pk>/approve/",
        AdminSellerApproveView.as_view(),
        name="marketplace-admin-seller-approve",
    ),
    path(
        "admin/parts/<uuid:pk>/suspend/",
        AdminPartSuspendView.as_view(),
        name="marketplace-admin-part-suspend",
    ),
    path("parts/", include(parts_router.urls)),
] + legacy_router.urls
