"""
URL configuration for tenant-related API endpoints.

Exposes:
- POST /api/v1/tenants/register/                      -> public onboarding application
- /api/v1/tenants/admin/onboarding-applications/[...] -> Superadmin review queue
- /api/v1/tenants/admin/tenants/[...]                 -> Superadmin CRUD over WorkshopTenant
"""
from __future__ import annotations

from django.urls import path, include
from rest_framework.routers import DefaultRouter

from global_vehicles.invoice_views import (
    AdminPlatformInvoiceViewSet,
    IssueSubscriptionInvoiceView,
    WorkshopPlatformInvoiceViewSet,
)
from global_vehicles.transfer_views import (
    AdminRegistrationChargeViewSet,
    AdminTenantPlatformBillingViewSet,
    AdminTransferViewSet,
    AdminVehicleAuditViewSet,
)

from .views import (
    SuperadminDashboardView,
    SuperadminGlobalRegistryView,
    TenantOnboardingApplicationViewSet,
    TenantRegisterView,
    WorkshopTenantAdminViewSet,
)

router = DefaultRouter()
router.register(
    r"admin/onboarding-applications",
    TenantOnboardingApplicationViewSet,
    basename="admin-onboarding-applications",
)
router.register(r"admin/tenants", WorkshopTenantAdminViewSet, basename="admin-tenants")
router.register(r"transfers", AdminTransferViewSet, basename="admin-transfers")
router.register(r"vehicle-audit", AdminVehicleAuditViewSet, basename="admin-vehicle-audit")
router.register(
    r"platform-billing",
    AdminTenantPlatformBillingViewSet,
    basename="admin-platform-billing",
)
router.register(
    r"registration-charges",
    AdminRegistrationChargeViewSet,
    basename="admin-registration-charges",
)
router.register(r"invoices", AdminPlatformInvoiceViewSet, basename="admin-invoices")

urlpatterns = [
    path("register/", TenantRegisterView.as_view(), name="tenant_register"),
    path("admin/dashboard/", SuperadminDashboardView.as_view(), name="admin-dashboard"),
    path("admin/global/", SuperadminGlobalRegistryView.as_view(), name="admin-global"),
    path(
        "platform-billing/<uuid:tenant_id>/issue-subscription-invoice/",
        IssueSubscriptionInvoiceView.as_view(),
        name="admin-issue-subscription-invoice",
    ),
    path("", include(router.urls)),
]
