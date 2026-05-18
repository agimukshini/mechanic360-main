"""
Serializers for vehicle management.

These implement the "tenants can add vehicles to clients" requirement.
Because each tenant has its own PostgreSQL schema, workshop users have full
rights over the data in their own schema (vehicles, etc.).

Note: ClientSerializer is imported from clients.serializers.
"""
from __future__ import annotations

from rest_framework import serializers

from clients.models import Client
from clients.serializers import ClientSerializer
from .models import Vehicle, VehicleDocument


class VehicleSerializer(serializers.ModelSerializer):
    """
    Serializer for vehicles.

    - `owner` is exposed as both `owner_id` (for writes) and a nested, read-only
      `owner` object for convenience on reads.
    - Multipart/form-data omits unchecked booleans; DRF otherwise treats missing
      `is_active` as False. We only apply `is_active` when the client sends it.
    """

    owner_id = serializers.UUIDField(write_only=True)
    owner = ClientSerializer(read_only=True)
    is_active = serializers.BooleanField(required=False, default=True)

    def to_representation(self, instance):
        data = super().to_representation(instance)
        if instance.photo:
            url = instance.photo.url
            request = self.context.get("request")
            if request and url.startswith("/"):
                data["photo"] = request.build_absolute_uri(url)
            else:
                data["photo"] = url
        else:
            data["photo"] = None
        return data

    class Meta:
        model = Vehicle
        fields = [
            "id",
            "owner",
            "owner_id",
            "vin",
            "license_plate",
            "make",
            "model",
            "year",
            "engine_type",
            "fuel_type",
            "odometer_km",
            "hour_meter",
            "photo",
            "is_active",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["id", "owner", "created_at", "updated_at"]

    def _is_active_sent(self) -> bool:
        request = self.context.get("request")
        if not request:
            return False
        data = getattr(request, "data", None)
        if data is None:
            return False
        try:
            return "is_active" in data
        except TypeError:
            return hasattr(data, "get") and data.get("is_active") is not None

    def _apply_is_active_default(self, validated_data: dict) -> None:
        """Drop phantom False from multipart; default new vehicles to active."""
        if not self._is_active_sent():
            validated_data.pop("is_active", None)
        if self.instance is None and "is_active" not in validated_data:
            validated_data["is_active"] = True

    def create(self, validated_data):
        """
        Create a new vehicle linked to the specified client (owner).
        """
        self._apply_is_active_default(validated_data)
        owner_id = validated_data.pop("owner_id")
        owner = Client.objects.get(id=owner_id)
        return Vehicle.objects.create(owner=owner, **validated_data)

    def update(self, instance, validated_data):
        """
        Allow updating core vehicle fields and optionally reassigning owner.
        """
        self._apply_is_active_default(validated_data)
        owner_id = validated_data.pop("owner_id", None)
        if owner_id is not None:
            instance.owner = Client.objects.get(id=owner_id)

        for attr, value in validated_data.items():
            setattr(instance, attr, value)

        instance.save()
        return instance


class VehicleDocumentSerializer(serializers.ModelSerializer):
    """
    Serializer for vehicle documents (service records, receipts, photos).
    """

    file_url = serializers.SerializerMethodField()
    size = serializers.IntegerField(source="file.size", read_only=True)
    filename = serializers.CharField(source="file.name", read_only=True)

    ALLOWED_CONTENT_TYPES = {
        "application/pdf",
        "image/jpeg",
        "image/png",
        "image/webp",
        "application/msword",
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    }
    MAX_FILE_BYTES = 15 * 1024 * 1024

    class Meta:
        model = VehicleDocument
        fields = [
            "id",
            "vehicle",
            "file",
            "file_url",
            "name",
            "filename",
            "size",
            "uploaded_by",
            "uploaded_at",
        ]
        read_only_fields = ["id", "vehicle", "file_url", "filename", "size", "uploaded_by", "uploaded_at"]

    def validate_file(self, file):
        content_type = getattr(file, "content_type", "") or ""
        if content_type and content_type not in self.ALLOWED_CONTENT_TYPES:
            raise serializers.ValidationError(
                f"Unsupported file type. Allowed: PDF, JPEG, PNG, WebP, Word."
            )
        if file.size > self.MAX_FILE_BYTES:
            raise serializers.ValidationError("File too large. Maximum size is 15MB.")
        return file

    def get_file_url(self, obj: VehicleDocument) -> str:
        request = self.context.get("request")
        if obj.file and hasattr(obj.file, "url"):
            return request.build_absolute_uri(obj.file.url) if request else obj.file.url
        return ""

    def create(self, validated_data):
        validated_data["uploaded_by"] = self.context["request"].user
        return super().create(validated_data)


