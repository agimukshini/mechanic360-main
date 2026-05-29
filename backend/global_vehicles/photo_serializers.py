"""
Cross-tenant gallery photo serializer. Lives on GlobalVehicle so any
workshop sees the same set of photos for a given VIN. Visit / inspection
data stays tenant-scoped — only the visual is shared.
"""
from __future__ import annotations

from rest_framework import serializers

from .models import GlobalVehiclePhoto


class GlobalVehiclePhotoSerializer(serializers.ModelSerializer):
    image_url = serializers.SerializerMethodField()
    uploaded_by_username = serializers.CharField(
        source="uploaded_by.username", read_only=True,
    )
    uploaded_by_tenant_name = serializers.CharField(
        source="uploaded_by_tenant.name", read_only=True,
    )

    ALLOWED_CONTENT_TYPES = {
        "image/jpeg", "image/png", "image/webp", "image/heic", "image/heif",
    }
    MAX_BYTES = 25 * 1024 * 1024

    class Meta:
        model = GlobalVehiclePhoto
        fields = [
            "id",
            "vehicle",
            "image",
            "image_url",
            "caption",
            "sort_order",
            "uploaded_by",
            "uploaded_by_username",
            "uploaded_by_tenant",
            "uploaded_by_tenant_name",
            "created_at",
            "updated_at",
        ]
        read_only_fields = [
            "id",
            "vehicle",
            "image_url",
            "uploaded_by",
            "uploaded_by_username",
            "uploaded_by_tenant",
            "uploaded_by_tenant_name",
            "created_at",
            "updated_at",
        ]

    def validate_image(self, image):
        ct = getattr(image, "content_type", "") or ""
        if ct and ct not in self.ALLOWED_CONTENT_TYPES:
            raise serializers.ValidationError(
                "Unsupported image type. Allowed: JPEG, PNG, WebP, HEIC.",
            )
        if image.size > self.MAX_BYTES:
            raise serializers.ValidationError(
                "Image too large. Maximum size is 25MB.",
            )
        return image

    def get_image_url(self, obj: GlobalVehiclePhoto) -> str:
        request = self.context.get("request")
        if obj.image and hasattr(obj.image, "url"):
            return request.build_absolute_uri(obj.image.url) if request else obj.image.url
        return ""
