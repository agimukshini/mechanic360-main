"""
App configuration for the visits app.
"""
from __future__ import annotations

from django.apps import AppConfig


class VisitsConfig(AppConfig):
    default_auto_field = "django.db.models.BigAutoField"
    name = "visits"

    def ready(self) -> None:
        """
        Import signals when the app is ready.
        """
        import visits.signals  # noqa: F401
