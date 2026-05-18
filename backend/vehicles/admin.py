"""
Admin configuration for the vehicles app.
"""
from __future__ import annotations

from django.contrib import admin

from .models import Vehicle, ServiceVisit, Inspection


@admin.register(Vehicle)
class VehicleAdmin(admin.ModelAdmin):
    list_display = ["license_plate", "make", "model", "year", "owner", "odometer_km"]
    list_filter = ["make", "model", "year", "fuel_type"]
    search_fields = ["vin", "license_plate", "make", "model", "owner__name"]
    ordering = ["license_plate"]


@admin.register(ServiceVisit)
class ServiceVisitAdmin(admin.ModelAdmin):
    list_display = ["id", "vehicle", "client", "status", "service_date", "mileage_km"]
    list_filter = ["status", "service_date"]
    search_fields = ["vehicle__license_plate", "vehicle__vin", "client__name"]
    ordering = ["-service_date"]


@admin.register(Inspection)
class InspectionAdmin(admin.ModelAdmin):
    list_display = ["id", "visit", "performed_by", "performed_at"]
    list_filter = ["performed_at"]
    search_fields = ["visit__vehicle__license_plate"]
    ordering = ["-performed_at"]
