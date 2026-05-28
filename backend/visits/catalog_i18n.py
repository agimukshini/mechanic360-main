"""Resolve workshop language for localized catalog labels."""
from __future__ import annotations


def catalog_language_from_request(request) -> str:
    if not request or not getattr(request, "user", None) or not request.user.is_authenticated:
        return "sq"
    tenant = getattr(request.user, "tenant", None)
    if tenant and getattr(tenant, "language", None):
        lang = str(tenant.language).lower()
        if lang.startswith("en"):
            return "en"
    return "sq"
