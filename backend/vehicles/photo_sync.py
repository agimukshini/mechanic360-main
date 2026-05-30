"""
Keep tenant gallery photos, global gallery photos, and the legacy hero
`Vehicle.photo` field in sync.

Hero uploads from the vehicle edit form only touched `Vehicle.photo` until
this module existed — the gallery UI reads `GlobalVehiclePhoto` rows instead.
"""
from __future__ import annotations

from django.db import connection

from global_vehicles.models import GlobalVehiclePhoto
from tenancy.views import public_schema

from .models import Vehicle, VehicleGalleryPhoto


def _uploader_tenant(user):
    return getattr(user, "tenant", None) if user and user.is_authenticated else None


def sync_hero_photo_to_gallery(*, vehicle: Vehicle, user=None, tenant=None) -> VehicleGalleryPhoto | None:
    """
    Mirror `Vehicle.photo` into the tenant gallery (sort_order=0) and the
    cross-tenant `GlobalVehiclePhoto` table.
    """
    if not vehicle.photo or not vehicle.photo.name:
        return None

    tenant = tenant or _uploader_tenant(user)
    hero = VehicleGalleryPhoto.objects.filter(vehicle=vehicle, sort_order=0).first()
    if hero is None:
        hero = VehicleGalleryPhoto(vehicle=vehicle, sort_order=0, uploaded_by=user)
    hero.image.name = vehicle.photo.name
    if user and user.is_authenticated:
        hero.uploaded_by = user
    hero.save()

    sync_gallery_photo_to_global(tenant_photo=hero, user=user, tenant=tenant)
    return hero


def sync_gallery_photo_to_global(
    *,
    tenant_photo: VehicleGalleryPhoto,
    user=None,
    tenant=None,
) -> GlobalVehiclePhoto | None:
    """Upsert the public-schema row for a tenant gallery photo."""
    vehicle = tenant_photo.vehicle
    if not vehicle.global_vehicle_id or not tenant_photo.image.name:
        return None

    tenant = tenant or _uploader_tenant(user)
    uploader_id = tenant_photo.uploaded_by_id
    if uploader_id:
        with public_schema():
            from django.contrib.auth import get_user_model

            User = get_user_model()
            if not User.objects.filter(id=uploader_id).exists():
                uploader_id = None

    with public_schema():
        global_photo, _created = GlobalVehiclePhoto.objects.update_or_create(
            id=tenant_photo.id,
            defaults={
                "vehicle_id": vehicle.global_vehicle_id,
                "image": tenant_photo.image.name,
                "caption": tenant_photo.caption,
                "sort_order": tenant_photo.sort_order,
                "uploaded_by_id": uploader_id,
                "uploaded_by_tenant_id": getattr(tenant, "id", None),
                "created_at": tenant_photo.created_at,
                "updated_at": tenant_photo.updated_at,
            },
        )
    return global_photo


def delete_global_gallery_photo(*, photo_id) -> None:
    with public_schema():
        GlobalVehiclePhoto.objects.filter(id=photo_id).delete()


def backfill_hero_photos_for_schema(*, tenant, user_model) -> int:
    """Data migration helper — mirror every hero photo into the gallery."""
    count = 0
    for vehicle in Vehicle.objects.exclude(photo="").exclude(photo__isnull=True):
        if VehicleGalleryPhoto.objects.filter(vehicle=vehicle).exists():
            continue
        sync_hero_photo_to_gallery(vehicle=vehicle, user=None, tenant=tenant)
        count += 1
    return count


def backfill_all_tenant_hero_photos(apps, schema_editor) -> None:
    """Run inside each tenant schema migration (not public)."""
    if connection.schema_name == "public":
        return

    WorkshopTenant = apps.get_model("tenancy", "WorkshopTenant")
    tenant = WorkshopTenant.objects.filter(schema_name=connection.schema_name).first()
    if tenant is None:
        return

    from vehicles.models import Vehicle as LiveVehicle, VehicleGalleryPhoto as LiveGallery

    for vehicle in LiveVehicle.objects.all():
        if not vehicle.photo or not getattr(vehicle.photo, "name", ""):
            continue
        if LiveGallery.objects.filter(vehicle=vehicle).exists():
            continue
        sync_hero_photo_to_gallery(vehicle=vehicle, user=None, tenant=tenant)
