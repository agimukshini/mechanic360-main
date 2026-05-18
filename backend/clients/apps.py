"""
Django app configuration for the clients module.
"""
from __future__ import annotations

from django.apps import AppConfig


class ClientsConfig(AppConfig):
    default_auto_field = "django.db.models.BigAutoField"
    name = "clients"
    verbose_name = "Client Management"
