from django.contrib import admin

from .models import GlobalOwner, GlobalVehicle, VehicleClaimToken, VehicleOwnership


@admin.register(GlobalVehicle)
class GlobalVehicleAdmin(admin.ModelAdmin):
    list_display = [
        "license_plate",
        "vin",
        "make",
        "model",
        "year",
        "odometer_km",
        "is_active",
        "registered_by_tenant",
    ]
    list_filter = ["is_active", "make", "registered_by_tenant"]
    search_fields = ["vin", "license_plate", "make", "model"]
    readonly_fields = ["created_at", "updated_at"]


@admin.register(GlobalOwner)
class GlobalOwnerAdmin(admin.ModelAdmin):
    list_display = ["name", "email", "phone", "user", "created_at"]
    search_fields = ["name", "email", "user__username"]


@admin.register(VehicleOwnership)
class VehicleOwnershipAdmin(admin.ModelAdmin):
    list_display = ["vehicle", "owner", "license_plate", "effective_from", "effective_to", "claim_method"]
    list_filter = ["claim_method"]
    search_fields = ["vehicle__vin", "vehicle__license_plate", "owner__name"]


@admin.register(VehicleClaimToken)
class VehicleClaimTokenAdmin(admin.ModelAdmin):
    list_display = [
        "vehicle",
        "purpose",
        "documents_verified",
        "expires_at",
        "used_at",
        "created_by_tenant",
    ]
    list_filter = ["purpose", "documents_verified"]
    readonly_fields = ["created_at", "used_at"]
