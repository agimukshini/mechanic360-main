"""
URL configuration for the `accounts` API (authentication & user profile).

Endpoints provided (supports MECH-7: User Authentication System):
- POST /api/v1/auth/token/        -> obtain JWT access/refresh (SimpleJWT)
- POST /api/v1/auth/token/refresh/-> refresh access token
- POST /api/v1/auth/register/     -> create a new user (tenant staff)
- GET  /api/v1/auth/me/           -> current user's profile
- GET/PATCH /api/v1/auth/settings/ -> user settings management
"""
from __future__ import annotations

from django.urls import include, path
from rest_framework.routers import DefaultRouter
from global_vehicles.invoice_views import (
    WorkshopPlatformBillingStatusView,
    WorkshopPlatformInvoiceViewSet,
)
from mechanic360.i18n_views import TranslationCoverageView
from .auth_views import LogoutView, ThrottledTokenObtainPairView, ThrottledTokenRefreshView
from .login_audit_views import SuperadminLoginAuditListView, TenantLoginAuditListView
from .invite_views import (
    StaffInviteAcceptView,
    StaffInvitePreviewView,
    TenantStaffInviteListCreateView,
)
from .pin_auth import ThrottledPinTokenObtainView
from .views import (
    MeView,
    RegisterView,
    TenantMechanicsListView,
    TenantUserViewSet,
    SettingsView,
    NotificationListView,
    NotificationMarkReadView,
)

router = DefaultRouter()
# Tenant-scoped user management for workshop admins
router.register(r"tenant/users", TenantUserViewSet, basename="tenant-users")
router.register(
    r"platform-invoices",
    WorkshopPlatformInvoiceViewSet,
    basename="workshop-platform-invoices",
)

urlpatterns = [
    # JWT token endpoints (login & refresh)
    path("token/", ThrottledTokenObtainPairView.as_view(), name="token_obtain_pair"),
    path("token/pin/", ThrottledPinTokenObtainView.as_view(), name="token_obtain_pin"),
    path("token/refresh/", ThrottledTokenRefreshView.as_view(), name="token_refresh"),
    path("logout/", LogoutView.as_view(), name="auth_logout"),

    # Registration & profile
    path("register/", RegisterView.as_view(), name="auth_register"),
    path("me/", MeView.as_view(), name="auth_me"),
    path("settings/", SettingsView.as_view(), name="auth_settings"),
    path(
        "platform-billing-status/",
        WorkshopPlatformBillingStatusView.as_view(),
        name="auth_platform_billing_status",
    ),
    path("tenant/mechanics/", TenantMechanicsListView.as_view(), name="auth_tenant_mechanics"),
    path("tenant/invites/", TenantStaffInviteListCreateView.as_view(), name="auth_tenant_invites"),
    path(
        "staff-invite/<uuid:token_id>/preview/",
        StaffInvitePreviewView.as_view(),
        name="auth_staff_invite_preview",
    ),
    path(
        "staff-invite/<uuid:token_id>/accept/",
        StaffInviteAcceptView.as_view(),
        name="auth_staff_invite_accept",
    ),
    path("login-audit/", TenantLoginAuditListView.as_view(), name="auth_login_audit"),
    path("admin/login-audit/", SuperadminLoginAuditListView.as_view(), name="auth_admin_login_audit"),
    path(
        "admin/translation-coverage/",
        TranslationCoverageView.as_view(),
        name="auth_admin_translation_coverage",
    ),

    # Notifications
    path("notifications/", NotificationListView.as_view(), name="notifications-list"),
    path("notifications/<str:pk>/mark-read/", NotificationMarkReadView.as_view(), name="notification-mark-read"),

    # Tenant admin user management
    path("", include(router.urls)),
]


