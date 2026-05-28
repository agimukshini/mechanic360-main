"""
Root URL configuration for the Mechanic360 backend.

This wires up:
- Admin (for internal staff)
- API v1 endpoints (namespaced)
- OpenAPI schema & Swagger UI

With django-tenants, we use PUBLIC_SCHEMA_URLS for the public schema
and tenant-specific URLs are included automatically.
"""
from __future__ import annotations

from django.conf import settings
from django.conf.urls.static import static
from django.contrib import admin
from django.urls import include, path

from drf_spectacular.views import (
    SpectacularAPIView,
    SpectacularRedocView,
    SpectacularSwaggerView,
)

# Public schema URLs (accessible without tenant)
urlpatterns = [
    # Django admin (public schema only)
    path("admin/", admin.site.urls),

    # API v1 modules
    path("api/v1/auth/", include("accounts.api_urls")),
    path("api/v1/tenants/", include("tenancy.api_urls")),
    path("api/v1/marketplace/", include("marketplace.api_urls")),
    path("api/v1/global-vehicles/", include("global_vehicles.api_urls")),
    path("api/v1/owner/", include("global_vehicles.owner_api_urls")),
    path("api/v1/clients/", include("clients.api_urls")),
    path("api/v1/vehicles/", include("vehicles.api_urls")),
    path("api/v1/visits/", include("visits.api_urls")),
    path("api/v1/inspections/", include("inspections.api_urls")),
    path("api/v1/inventory/", include("inventory.api_urls")),
]

# Tenant schema URLs (same as public for now)
tenant_urlpatterns = [
    path("api/v1/auth/", include("accounts.api_urls")),
    path("api/v1/global-vehicles/", include("global_vehicles.api_urls")),
    path("api/v1/owner/", include("global_vehicles.owner_api_urls")),
    path("api/v1/clients/", include("clients.api_urls")),
    path("api/v1/vehicles/", include("vehicles.api_urls")),
    path("api/v1/visits/", include("visits.api_urls")),
    path("api/v1/inspections/", include("inspections.api_urls")),
    path("api/v1/inventory/", include("inventory.api_urls")),
]

# OpenAPI docs (development only)
if settings.DEBUG:
    urlpatterns += [
        path("api/schema/", SpectacularAPIView.as_view(), name="schema"),
        path(
            "api/docs/swagger/",
            SpectacularSwaggerView.as_view(url_name="schema"),
            name="swagger-ui",
        ),
        path(
            "api/docs/redoc/",
            SpectacularRedocView.as_view(url_name="schema"),
            name="redoc",
        ),
    ]
    urlpatterns += static(settings.MEDIA_URL, document_root=settings.MEDIA_ROOT)


