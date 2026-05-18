"""
Unit tests for vehicle serializers.
"""
from __future__ import annotations

from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import SimpleTestCase

from django.http import QueryDict

from vehicles.serializers import VehicleDocumentSerializer, VehicleSerializer


class VehicleSerializerTests(SimpleTestCase):
    def test_multipart_phantom_is_active_defaults_to_active_on_create(self):
        qd = QueryDict(mutable=True)
        qd.update({"make": "Test"})
        request = type("Req", (), {"data": qd})()
        serializer = VehicleSerializer(context={"request": request})
        validated = {"is_active": False}
        serializer._apply_is_active_default(validated)
        self.assertTrue(validated["is_active"])

    def test_explicit_is_active_false_is_kept_when_sent(self):
        qd = QueryDict(mutable=True)
        qd.update({"is_active": "false"})
        request = type("Req", (), {"data": qd})()
        serializer = VehicleSerializer(context={"request": request})
        validated = {"is_active": False}
        serializer._apply_is_active_default(validated)
        self.assertFalse(validated["is_active"])


class VehicleDocumentSerializerTests(SimpleTestCase):
    def test_rejects_oversized_file(self):
        large = SimpleUploadedFile(
            "big.pdf",
            b"x" * (VehicleDocumentSerializer.MAX_FILE_BYTES + 1),
            content_type="application/pdf",
        )
        serializer = VehicleDocumentSerializer(data={"file": large, "name": "test"})
        self.assertFalse(serializer.is_valid())
        self.assertIn("file", serializer.errors)

    def test_rejects_unsupported_content_type(self):
        bad = SimpleUploadedFile("evil.exe", b"data", content_type="application/x-msdownload")
        serializer = VehicleDocumentSerializer(data={"file": bad, "name": "test"})
        self.assertFalse(serializer.is_valid())
        self.assertIn("file", serializer.errors)
