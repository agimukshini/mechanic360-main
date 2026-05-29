"""
Cross-tenant photo gallery: any workshop sees the same set of photos for
a global vehicle, but only the uploading workshop can edit / delete what
they posted. Mirrors `VEHICLE_SHARING_POLICY.md` §2.1.
"""
from __future__ import annotations

import io

from django.contrib.auth import get_user_model
from django.core.files.uploadedfile import SimpleUploadedFile
from django.db import connection
from django.test import TestCase
from PIL import Image
from rest_framework.test import APIClient
from rest_framework_simplejwt.tokens import RefreshToken

from global_vehicles.models import GlobalVehicle, GlobalVehiclePhoto
from tenancy.models import WorkshopTenant
from tenancy.views import public_schema

User = get_user_model()


def _png_bytes() -> bytes:
    """Real 1x1 PNG that passes Pillow validation."""
    buf = io.BytesIO()
    Image.new("RGB", (1, 1), color=(255, 0, 0)).save(buf, format="PNG")
    return buf.getvalue()


class CrossTenantPhotoGalleryTests(TestCase):
    def setUp(self):
        self.shop_a = WorkshopTenant.objects.create(name="Shop A", schema_name="shop_a")
        self.shop_b = WorkshopTenant.objects.create(name="Shop B", schema_name="shop_b")
        self.user_a = User.objects.create_user(
            username="user_a",
            password="pass12345",
            role=User.Role.ADMIN,
            tenant=self.shop_a,
        )
        self.user_b = User.objects.create_user(
            username="user_b",
            password="pass12345",
            role=User.Role.ADMIN,
            tenant=self.shop_b,
        )
        with public_schema():
            self.global_vehicle = GlobalVehicle.objects.create(
                vin="WVWPHOTO000000123",
                license_plate="PG-001",
                make="VW",
                model="Polo",
                year=2019,
            )

        self.api_a = self._auth(self.user_a)
        self.api_b = self._auth(self.user_b)

    def tearDown(self):
        connection.set_schema("public")

    def _auth(self, user) -> APIClient:
        api = APIClient()
        token = RefreshToken.for_user(user).access_token
        api.credentials(HTTP_AUTHORIZATION=f"Bearer {token}")
        return api

    def _upload_image(self, api: APIClient, caption: str = "engine bay") -> str:
        upload = SimpleUploadedFile("p.png", _png_bytes(), content_type="image/png")
        response = api.post(
            "/api/v1/global-vehicles/photos/",
            {
                "vehicle_id": str(self.global_vehicle.id),
                "image": upload,
                "caption": caption,
                "sort_order": 0,
            },
            format="multipart",
        )
        self.assertEqual(response.status_code, 201, response.data)
        return response.data["id"]

    def test_shop_a_uploads_shop_b_sees_the_same_photo(self):
        photo_id = self._upload_image(self.api_a)

        response = self.api_b.get(
            f"/api/v1/global-vehicles/photos/?vehicle={self.global_vehicle.id}",
        )
        self.assertEqual(response.status_code, 200)
        body = response.data
        items = body["results"] if isinstance(body, dict) and "results" in body else body
        ids = [p["id"] for p in items]
        self.assertIn(photo_id, ids)
        same = next(p for p in items if p["id"] == photo_id)
        self.assertEqual(same["uploaded_by_tenant_name"], "Shop A")

    def test_only_uploader_tenant_can_delete(self):
        photo_id = self._upload_image(self.api_a)

        response_b = self.api_b.delete(f"/api/v1/global-vehicles/photos/{photo_id}/")
        self.assertEqual(response_b.status_code, 403)
        self.assertTrue(GlobalVehiclePhoto.objects.filter(id=photo_id).exists())

        response_a = self.api_a.delete(f"/api/v1/global-vehicles/photos/{photo_id}/")
        self.assertEqual(response_a.status_code, 204)
        self.assertFalse(GlobalVehiclePhoto.objects.filter(id=photo_id).exists())

    def test_only_uploader_tenant_can_update_caption(self):
        photo_id = self._upload_image(self.api_a)

        response_b = self.api_b.patch(
            f"/api/v1/global-vehicles/photos/{photo_id}/",
            {"caption": "vandalised"},
            format="multipart",
        )
        self.assertEqual(response_b.status_code, 403)

        response_a = self.api_a.patch(
            f"/api/v1/global-vehicles/photos/{photo_id}/",
            {"caption": "left wheel close-up"},
            format="multipart",
        )
        self.assertEqual(response_a.status_code, 200)
        self.assertEqual(response_a.data["caption"], "left wheel close-up")

    def test_upload_records_uploader_metadata(self):
        photo_id = self._upload_image(self.api_a, caption="paint scratch")
        photo = GlobalVehiclePhoto.objects.get(id=photo_id)
        self.assertEqual(photo.uploaded_by_id, self.user_a.id)
        self.assertEqual(photo.uploaded_by_tenant_id, self.shop_a.id)
        self.assertEqual(photo.caption, "paint scratch")
        self.assertEqual(photo.vehicle_id, self.global_vehicle.id)

    def test_unknown_global_vehicle_id_is_rejected(self):
        upload = SimpleUploadedFile("p.png", _png_bytes(), content_type="image/png")
        response = self.api_a.post(
            "/api/v1/global-vehicles/photos/",
            {
                "vehicle_id": "00000000-0000-0000-0000-000000000000",
                "image": upload,
                "caption": "ghost",
            },
            format="multipart",
        )
        self.assertEqual(response.status_code, 400)
