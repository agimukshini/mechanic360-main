"""
URL configuration for tenant-related API endpoints.

Exposes:
- POST /api/v1/tenants/register/         -> public registration (tenant + admin)
- /api/v1/tenants/admin/tenants/[...]    -> Superadmin CRUD over WorkshopTenant
"""
from __future__ import annotations

from django.urls import path, include
from rest_framework.routers import DefaultRouter

from .views import TenantRegisterView, WorkshopTenantAdminViewSet

router = DefaultRouter()
router.register(r"admin/tenants", WorkshopTenantAdminViewSet, basename="admin-tenants")

urlpatterns = [
    # Public registration
    path("register/", TenantRegisterView.as_view(), name="tenant_register"),

    # Superadmin tenant management
    path("", include(router.urls)),
]



