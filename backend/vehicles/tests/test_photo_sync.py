"""Tests for hero ↔ gallery photo sync."""
from __future__ import annotations

import io

from django.contrib.auth import get_user_model
from django.core.files.uploadedfile import SimpleUploadedFile
from django_tenants.test.cases import TenantTestCase
from PIL import Image
from rest_framework.test import APIClient
from rest_framework_simplejwt.tokens import RefreshToken

from clients.models import Client
from global_vehicles.models import GlobalVehiclePhoto
from vehicles.models import Vehicle, VehicleGalleryPhoto
from vehicles.photo_sync import sync_hero_photo_to_gallery

User = get_user_model()


def _png(name: str = "hero.png") -> SimpleUploadedFile:
    buf = io.BytesIO()
    Image.new("RGB", (4, 4), color=(10, 20, 30)).save(buf, format="PNG")
    return SimpleUploadedFile(name, buf.getvalue(), content_type="image/png")


class HeroGallerySyncTests(TenantTestCase):
    tenant_schema = "test_photo_sync"

    def setUp(self):
        super().setUp()
        self.user = User.objects.create_user(
            username="mech1",
            password="pass12345",
            role=User.Role.MECHANIC,
            tenant=self.tenant,
        )
        self.client_record = Client.objects.create(
            name="Owner",
            email="owner@example.com",
            phone="123",
        )
        self.vehicle = Vehicle.objects.create(
            owner=self.client_record,
            vin="PHOTOSYNC1234567",
            license_plate="PH-001",
            make="Test",
            model="Car",
            year=2020,
            photo=_png(),
        )
        from vehicles.global_sync import sync_vehicle_to_global

        sync_vehicle_to_global(vehicle=self.vehicle, user=self.user, tenant=self.tenant)
        self.vehicle.refresh_from_db()

    def test_sync_hero_photo_creates_tenant_and_global_gallery_rows(self):
        self.assertFalse(VehicleGalleryPhoto.objects.filter(vehicle=self.vehicle).exists())
        sync_hero_photo_to_gallery(vehicle=self.vehicle, user=self.user, tenant=self.tenant)

        tenant_photo = VehicleGalleryPhoto.objects.get(vehicle=self.vehicle, sort_order=0)
        self.assertEqual(tenant_photo.image.name, self.vehicle.photo.name)

        global_photo = GlobalVehiclePhoto.objects.get(id=tenant_photo.id)
        self.assertEqual(global_photo.vehicle_id, self.vehicle.global_vehicle_id)
        self.assertEqual(global_photo.image.name, self.vehicle.photo.name)

    def test_vehicle_update_with_photo_adds_gallery_entry(self):
        self.vehicle.photo = _png("updated.png")
        self.vehicle.save()
        sync_hero_photo_to_gallery(vehicle=self.vehicle, user=self.user, tenant=self.tenant)

        self.assertEqual(VehicleGalleryPhoto.objects.filter(vehicle=self.vehicle).count(), 1)
        photo = VehicleGalleryPhoto.objects.get(vehicle=self.vehicle, sort_order=0)
        self.assertTrue(photo.image.name.endswith("updated.png"))

    def test_global_gallery_lists_uploaded_photo(self):
        sync_hero_photo_to_gallery(vehicle=self.vehicle, user=self.user, tenant=self.tenant)
        api = APIClient()
        token = RefreshToken.for_user(self.user).access_token
        api.credentials(HTTP_AUTHORIZATION=f"Bearer {token}")
        api.defaults["HTTP_HOST"] = "localhost"

        response = api.get(
            f"/api/v1/global-vehicles/photos/?vehicle={self.vehicle.global_vehicle_id}",
        )
        self.assertEqual(response.status_code, 200)
        items = response.data["results"] if isinstance(response.data, dict) else response.data
        self.assertEqual(len(items), 1)
