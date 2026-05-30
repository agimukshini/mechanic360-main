"""
Translation coverage helpers for superadmin health checks.
"""
from __future__ import annotations

from visits.models import ServiceCatalogItem


def service_catalog_coverage() -> dict:
    total = ServiceCatalogItem.objects.count()
    translated_sq = ServiceCatalogItem.objects.exclude(name_sq="").count()
    translated_en = ServiceCatalogItem.objects.exclude(name="").count()
    missing = []
    for item in ServiceCatalogItem.objects.filter(name_sq="").only("id", "name")[:50]:
        missing.append(
            {
                "area": "service_catalog",
                "id": str(item.id),
                "label": item.name,
            },
        )
    return {
        "total": total,
        "translated": {"en": translated_en, "sq": translated_sq},
        "missing": missing,
    }


def build_translation_coverage_report(*, include_tenant_catalog: bool = True) -> dict:
    if include_tenant_catalog:
        catalog = service_catalog_coverage()
    else:
        catalog = {
            "total": 0,
            "translated": {"en": 0, "sq": 0},
            "note": "Tenant-scoped; run inside a tenant schema for live counts.",
            "missing": [],
        }
    return {
        "service_catalog": catalog,
        "inspection_items": {
            "total": 0,
            "translated": {"en": 0, "sq": 0},
            "note": "Inspection checklist labels are frontend i18n keys.",
        },
        "frontend_locales": ["en", "sq"],
        "missing": catalog.get("missing", []),
    }
