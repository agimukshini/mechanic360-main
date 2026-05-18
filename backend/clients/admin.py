"""
Admin configuration for the clients app.
"""
from __future__ import annotations

from django.contrib import admin

from .models import Client


@admin.register(Client)
class ClientAdmin(admin.ModelAdmin):
    list_display = ["name", "type", "company_name", "email", "phone", "created_at"]
    list_filter = ["type", "created_at"]
    search_fields = ["name", "company_name", "email", "phone"]
    ordering = ["-created_at"]
