"""
Router for visit-related APIs:

- /api/v1/visits/                        -> Service visits CRUD
- /api/v1/visits/catalog/              -> Service catalog CRUD
- /api/v1/visits/service-lines/       -> Service line items for visits
- /api/v1/visits/material-lines/      -> Material/part line items for visits
- /api/v1/visits/labor-lines/         -> Labor line items for visits
- /api/v1/visits/maintenance-plans/   -> Preventive maintenance plans per vehicle
- /api/v1/visits/analytics/           -> Analytics and reporting endpoints
- /api/v1/visits/reports/             -> PDF report generation
"""
from __future__ import annotations

from rest_framework.routers import DefaultRouter
from django.urls import path

from .views import (
    ServiceVisitViewSet,
    ServiceCatalogViewSet,
    VisitLaborLineViewSet,
    VisitMaterialLineViewSet,
    VisitServiceLineViewSet,
    PreventiveMaintenancePlanViewSet,
)
from .analytics_views import (
    dashboard_stats,
    visits_overview,
    revenue_breakdown,
    parts_consumption,
    maintenance_forecast,
)
from .pdf_views import (
    generate_service_report,
    generate_door_sticker,
)

router = DefaultRouter()
# Register catalog FIRST so it doesn't get caught by the root route
router.register(r"catalog", ServiceCatalogViewSet, basename="service-catalog")
router.register(r"service-lines", VisitServiceLineViewSet, basename="visit-service-lines")
router.register(r"material-lines", VisitMaterialLineViewSet, basename="visit-material-lines")
router.register(r"labor-lines", VisitLaborLineViewSet, basename="visit-labor-lines")
router.register(
    r"maintenance-plans",
    PreventiveMaintenancePlanViewSet,
    basename="preventive-maintenance-plans",
)
# Register root route LAST
router.register(r"", ServiceVisitViewSet, basename="service-visit")

urlpatterns = router.urls + [
    path("analytics/dashboard/", dashboard_stats, name="analytics-dashboard"),
    path("analytics/visits-overview/", visits_overview, name="visits-overview"),
    path("analytics/revenue/", revenue_breakdown, name="revenue-breakdown"),
    path("analytics/parts-consumption/", parts_consumption, name="parts-consumption"),
    path("analytics/maintenance-forecast/", maintenance_forecast, name="maintenance-forecast"),
    path("reports/service-report/<str:visit_id>/", generate_service_report, name="service-report"),
    path("reports/door-sticker/<str:visit_id>/", generate_door_sticker, name="door-sticker"),
]

