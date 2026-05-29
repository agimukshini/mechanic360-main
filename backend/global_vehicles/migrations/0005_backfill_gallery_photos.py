# Backfill GlobalVehiclePhoto from each tenant's VehicleGalleryPhoto so the
# cross-tenant gallery is populated on day one. The image files themselves
# stay where they are on disk (`media/vehicle_photos/...`) — both the legacy
# tenant rows and the new public rows reference the same paths, so we don't
# move bytes. The legacy `vehicles.VehicleGalleryPhoto` model is left in
# place; subsequent code reads exclusively from the public model.

from django.db import connection, migrations


def backfill_photos(apps, schema_editor):
    if connection.schema_name != "public":
        return

    GlobalVehiclePhoto = apps.get_model("global_vehicles", "GlobalVehiclePhoto")
    WorkshopTenant = apps.get_model("tenancy", "WorkshopTenant")
    User = apps.get_model("accounts", "User")

    tenants = list(WorkshopTenant.objects.exclude(schema_name="public"))
    for tenant in tenants:
        try:
            connection.set_schema(tenant.schema_name)
            from vehicles.models import (
                Vehicle as TenantVehicle,
                VehicleGalleryPhoto as TenantPhoto,
            )
            local_vehicles = {
                v.id: v.global_vehicle_id
                for v in TenantVehicle.objects.exclude(global_vehicle_id__isnull=True).only(
                    "id", "global_vehicle_id"
                )
            }
            tenant_photos = list(
                TenantPhoto.objects.filter(vehicle_id__in=local_vehicles.keys())
            )
            tenant_uploader_ids = {
                p.uploaded_by_id for p in tenant_photos if p.uploaded_by_id
            }
        except Exception:
            connection.set_schema("public")
            continue
        finally:
            connection.set_schema("public")

        if not tenant_photos:
            continue

        existing_uploaders = set(
            User.objects.filter(id__in=tenant_uploader_ids).values_list("id", flat=True)
        )

        for photo in tenant_photos:
            global_vehicle_id = local_vehicles.get(photo.vehicle_id)
            if not global_vehicle_id:
                continue
            uploader_id = (
                photo.uploaded_by_id if photo.uploaded_by_id in existing_uploaders else None
            )
            GlobalVehiclePhoto.objects.update_or_create(
                id=photo.id,
                defaults={
                    "vehicle_id": global_vehicle_id,
                    "image": photo.image.name if photo.image else "",
                    "caption": photo.caption,
                    "sort_order": photo.sort_order,
                    "uploaded_by_id": uploader_id,
                    "uploaded_by_tenant_id": tenant.id,
                    "created_at": photo.created_at,
                    "updated_at": photo.updated_at,
                },
            )


def noop_reverse(apps, schema_editor):
    pass


class Migration(migrations.Migration):

    dependencies = [
        ("global_vehicles", "0004_globalvehiclephoto"),
    ]

    operations = [
        migrations.RunPython(backfill_photos, noop_reverse),
    ]
