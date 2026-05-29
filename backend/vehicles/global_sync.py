"""
Sync tenant workshop vehicles to the platform-wide global registry.
"""
from __future__ import annotations

import uuid

from django.core.files.base import ContentFile
from django.db import connection
from rest_framework.exceptions import ValidationError

from global_vehicles.models import GlobalVehicle
from global_vehicles.services import normalize_plate
from tenancy.views import public_schema

from .models import Vehicle


GLOBAL_FIELDS = (
    "license_plate",
    "make",
    "model",
    "year",
    "engine_type",
    "fuel_type",
    "odometer_km",
    "hour_meter",
    "is_active",
)


def _apply_vehicle_fields(*, global_vehicle: GlobalVehicle, vehicle: Vehicle) -> None:
    global_vehicle.license_plate = normalize_plate(vehicle.license_plate)
    global_vehicle.make = vehicle.make
    global_vehicle.model = vehicle.model
    global_vehicle.year = vehicle.year
    global_vehicle.engine_type = vehicle.engine_type or ""
    global_vehicle.fuel_type = vehicle.fuel_type or ""
    global_vehicle.odometer_km = vehicle.odometer_km or 0
    global_vehicle.hour_meter = vehicle.hour_meter or 0
    global_vehicle.is_active = vehicle.is_active


def _sync_photo(*, global_vehicle: GlobalVehicle, vehicle: Vehicle) -> None:
    if not vehicle.photo:
        return
    try:
        vehicle.photo.open("rb")
        try:
            content = vehicle.photo.read()
        finally:
            vehicle.photo.close()
        filename = vehicle.photo.name.rsplit("/", 1)[-1]
        global_vehicle.photo.save(filename, ContentFile(content), save=False)
    except OSError:
        pass


def get_global_vehicle(vehicle: Vehicle) -> GlobalVehicle | None:
    if not vehicle.global_vehicle_id:
        return None
    with public_schema():
        return (
            GlobalVehicle.objects.prefetch_related("ownerships__owner")
            .filter(id=vehicle.global_vehicle_id)
            .first()
        )


def get_global_vehicle_or_sync(*, vehicle: Vehicle, user, tenant) -> GlobalVehicle:
    global_vehicle = get_global_vehicle(vehicle)
    if global_vehicle is None:
        return sync_vehicle_to_global(vehicle=vehicle, user=user, tenant=tenant)
    return global_vehicle


def sync_vehicle_to_global(*, vehicle: Vehicle, user, tenant) -> GlobalVehicle:
    """
    Create or update the global registry entry for a workshop vehicle.

    VIN is the permanent key; registration plate and other fields stay in sync.
    """
    vin = (vehicle.vin or "").strip().upper()
    if len(vin) < 3:
        raise ValidationError({"vin": "VIN must be at least 3 characters."})

    tenant_schema = connection.schema_name

    with public_schema():
        if vehicle.global_vehicle_id:
            try:
                global_vehicle = GlobalVehicle.objects.get(id=vehicle.global_vehicle_id)
            except GlobalVehicle.DoesNotExist:
                global_vehicle = None
        else:
            global_vehicle = GlobalVehicle.objects.filter(vin=vin).first()

        is_first_registration = False
        if global_vehicle is None:
            global_vehicle = GlobalVehicle(
                id=uuid.uuid4(),
                vin=vin,
                registered_by_tenant=tenant,
                registered_by=user if user and user.is_authenticated else None,
            )
            is_first_registration = True
        elif global_vehicle.vin != vin:
            raise ValidationError(
                {"vin": "This vehicle is already linked to a different VIN in the global registry."},
            )

        _apply_vehicle_fields(global_vehicle=global_vehicle, vehicle=vehicle)
        _sync_photo(global_vehicle=global_vehicle, vehicle=vehicle)
        global_vehicle.save()
        global_id = global_vehicle.id

        # First-time registration triggers the platform billing line. Done
        # inside the public_schema block — the charge row lives there too.
        if is_first_registration and tenant is not None:
            try:
                from global_vehicles.transfer_services import (
                    record_registration_charge,
                )
                record_registration_charge(
                    vehicle=global_vehicle,
                    tenant=tenant,
                    created_by=user if user and user.is_authenticated else None,
                )
            except Exception:  # pragma: no cover — never block vehicle save
                pass

    connection.set_schema(tenant_schema)
    if vehicle.global_vehicle_id != global_id:
        vehicle.global_vehicle_id = global_id
        vehicle.save(update_fields=["global_vehicle_id"])

    with public_schema():
        return GlobalVehicle.objects.get(id=global_id)
