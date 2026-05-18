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
from .auth_views import LogoutView, ThrottledTokenObtainPairView, ThrottledTokenRefreshView
from .pin_auth import ThrottledPinTokenObtainView
from .views import MeView, RegisterView, TenantUserViewSet, SettingsView, NotificationListView, NotificationMarkReadView

router = DefaultRouter()
# Tenant-scoped user management for workshop admins
router.register(r"tenant/users", TenantUserViewSet, basename="tenant-users")

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

    # Notifications
    path("notifications/", NotificationListView.as_view(), name="notifications-list"),
    path("notifications/<str:pk>/mark-read/", NotificationMarkReadView.as_view(), name="notification-mark-read"),

    # Tenant admin user management
    path("", include(router.urls)),
]


