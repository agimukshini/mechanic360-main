"""
App configuration for the marketplace app.
"""
from __future__ import annotations

from django.apps import AppConfig


class MarketplaceConfig(AppConfig):
    default_auto_field = "django.db.models.BigAutoField"
    name = "marketplace"
    verbose_name = "Marketplace"

    def ready(self):
        from . import signals  # noqa: F401
