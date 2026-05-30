"""
Serializers for vehicle management.

These implement the "tenants can add vehicles to clients" requirement.
Because each tenant has its own PostgreSQL schema, workshop users have full
rights over the data in their own schema (vehicles, etc.).

Note: ClientSerializer is imported from clients.serializers.
"""
from __future__ import annotations

from django.contrib.auth import get_user_model
from rest_framework import serializers

from accounts.serializers import UserSerializer
from clients.models import Client
from clients.serializers import ClientSerializer
from global_vehicles.serializers import GlobalOwnerSerializer, VehicleOwnershipSerializer

from .global_sync import get_global_vehicle, sync_vehicle_to_global
from .models import Vehicle, VehicleDocument, VehicleGalleryPhoto
from .photo_sync import sync_hero_photo_to_gallery

User = get_user_model()


class VehicleSerializer(serializers.ModelSerializer):
    """
    Serializer for vehicles.

    - `owner` is exposed as both `owner_id` (for writes) and a nested, read-only
      `owner` object for convenience on reads.
    - Multipart/form-data omits unchecked booleans; DRF otherwise treats missing
      `is_active` as False. We only apply `is_active` when the client sends it.
    """

    owner_id = serializers.CharField(
        write_only=True,
        required=False,
        allow_null=True,
        allow_blank=True,
    )
    owner = ClientSerializer(read_only=True)
    assigned_mechanic = UserSerializer(read_only=True)
    assigned_mechanic_id = serializers.CharField(
        required=False,
        allow_blank=True,
        write_only=True,
    )
    is_active = serializers.BooleanField(required=False, default=True)
    odometer_km = serializers.IntegerField(required=False, allow_null=True, min_value=0)
    odometer_unit = serializers.ChoiceField(
        choices=[("km", "km"), ("mi", "mi")],
        required=False,
        default="km",
    )
    hour_meter = serializers.IntegerField(required=False, allow_null=True, min_value=0)
    global_vehicle_id = serializers.UUIDField(read_only=True)
    global_current_owner = GlobalOwnerSerializer(read_only=True)
    registration_history = VehicleOwnershipSerializer(many=True, read_only=True)

    class Meta:
        model = Vehicle
        fields = [
            "id",
            "global_vehicle_id",
            "global_current_owner",
            "registration_history",
            "owner",
            "owner_id",
            "assigned_mechanic",
            "assigned_mechanic_id",
            "vin",
            "license_plate",
            "make",
            "model",
            "year",
            "engine_type",
            "fuel_type",
            "description",
            "odometer_km",
            "odometer_unit",
            "hour_meter",
            "photo",
            "is_active",
            "created_at",
            "updated_at",
        ]
        read_only_fields = [
            "id",
            "global_vehicle_id",
            "global_current_owner",
            "registration_history",
            "owner",
            "assigned_mechanic",
            "created_at",
            "updated_at",
        ]

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self._mechanic_queryset = User.objects.none()
        request = self.context.get("request")
        tenant_id = getattr(getattr(request, "user", None), "tenant_id", None)
        if tenant_id:
            self._mechanic_queryset = User.objects.filter(
                tenant_id=tenant_id,
                role=User.Role.MECHANIC,
                is_active=True,
            )

    def validate(self, attrs):
        request = self.context.get("request")
        user = getattr(request, "user", None)
        owner_raw = attrs.get("owner_id", serializers.empty)
        if owner_raw is serializers.empty and self.instance is not None:
            pass
        elif owner_raw is serializers.empty and self.instance is None:
            attrs["owner_id"] = None
        elif owner_raw in (None, ""):
            attrs["owner_id"] = None
        elif owner_raw is not serializers.empty:
            from uuid import UUID

            try:
                attrs["owner_id"] = str(UUID(str(owner_raw)))
            except (ValueError, TypeError, AttributeError) as exc:
                raise serializers.ValidationError({"owner_id": "Invalid owner id."}) from exc
        mechanic_raw = attrs.pop("assigned_mechanic_id", serializers.empty)
        if mechanic_raw is not serializers.empty:
            from mechanic360.permissions import STAFF_ROLES

            if mechanic_raw in ("", None):
                attrs["assigned_mechanic"] = None
            else:
                if user and getattr(user, "role", None) not in STAFF_ROLES:
                    raise serializers.ValidationError(
                        {
                            "assigned_mechanic_id": (
                                "Only workshop admins can assign mechanics."
                            )
                        }
                    )
                try:
                    mechanic = self._mechanic_queryset.get(pk=mechanic_raw)
                except (User.DoesNotExist, ValueError, TypeError):
                    raise serializers.ValidationError(
                        {"assigned_mechanic_id": "Invalid mechanic for this workshop."}
                    ) from None
                attrs["assigned_mechanic"] = mechanic

        request_data = getattr(request, "data", None) if request else None
        if request_data is not None:
            for field in ("odometer_km", "hour_meter"):
                if field in request_data:
                    raw = request_data.get(field)
                    if raw in (None, ""):
                        attrs[field] = None
                    else:
                        try:
                            attrs[field] = max(0, int(raw))
                        except (ValueError, TypeError) as exc:
                            raise serializers.ValidationError(
                                {field: "Must be a non-negative number."},
                            ) from exc

        unit = attrs.get("odometer_unit")
        if unit and unit not in {Vehicle.OdometerUnit.KM, Vehicle.OdometerUnit.MI}:
            raise serializers.ValidationError({"odometer_unit": "Unit must be km or mi."})

        return attrs

    def _attach_global_profile(self, data: dict, instance: Vehicle) -> dict:
        # All global registry reads must run in the public schema — the
        # cross-schema prefetch is set up inside `get_global_vehicle`, but
        # any *additional* queryset access (history, current_owner via
        # `.filter()`) would otherwise hit the tenant schema and silently
        # return nothing.
        from django_tenants.utils import schema_context

        global_vehicle = get_global_vehicle(instance)
        if not global_vehicle:
            data["global_current_owner"] = None
            data["registration_history"] = []
            return data

        with schema_context("public"):
            data["global_vehicle_id"] = str(global_vehicle.id)
            owner = global_vehicle.current_owner
            data["global_current_owner"] = (
                GlobalOwnerSerializer(owner).data if owner else None
            )
            ownerships = list(
                global_vehicle.ownerships.select_related("owner").order_by(
                    "-effective_from",
                ),
            )
            data["registration_history"] = VehicleOwnershipSerializer(
                ownerships,
                many=True,
            ).data
            global_plate = (global_vehicle.license_plate or "").strip().upper()

        # Tenant-side plate sync — global registry is authoritative since a
        # transfer in another workshop changes it without the local workshop
        # being notified. Done OUTSIDE public_schema() so the Vehicle.save
        # writes to the tenant schema.
        if (
            global_plate
            and global_plate != (instance.license_plate or "").strip().upper()
        ):
            data["license_plate"] = global_plate
            try:
                instance.license_plate = global_plate
                instance.save(update_fields=["license_plate"])
            except Exception:  # pragma: no cover — best-effort sync
                pass

        return data

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
        return self._attach_global_profile(data, instance)

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
        Create a workshop vehicle and register it in the global registry.
        """
        self._apply_is_active_default(validated_data)
        owner_id = validated_data.pop("owner_id", None)
        owner = Client.objects.get(id=owner_id) if owner_id else None
        vehicle = Vehicle.objects.create(owner=owner, **validated_data)

        request = self.context.get("request")
        user = getattr(request, "user", None)
        tenant = getattr(user, "tenant", None) if user else None
        sync_vehicle_to_global(vehicle=vehicle, user=user, tenant=tenant)
        vehicle.refresh_from_db()
        if validated_data.get("photo"):
            sync_hero_photo_to_gallery(vehicle=vehicle, user=user, tenant=tenant)
        return vehicle

    def update(self, instance, validated_data):
        """
        Update workshop vehicle fields and keep the global registry in sync.
        """
        self._apply_is_active_default(validated_data)
        owner_id = validated_data.pop("owner_id", serializers.empty)
        if owner_id is not serializers.empty:
            instance.owner = Client.objects.get(id=owner_id) if owner_id else None

        for attr, value in validated_data.items():
            setattr(instance, attr, value)

        instance.save()

        request = self.context.get("request")
        user = getattr(request, "user", None)
        tenant = getattr(user, "tenant", None) if user else None
        sync_vehicle_to_global(vehicle=instance, user=user, tenant=tenant)
        instance.refresh_from_db()
        if "photo" in validated_data and instance.photo:
            sync_hero_photo_to_gallery(vehicle=instance, user=user, tenant=tenant)
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


class VehicleGalleryPhotoSerializer(serializers.ModelSerializer):
    """Workshop-uploaded photos in the vehicle gallery."""

    image_url = serializers.SerializerMethodField()
    uploaded_by_username = serializers.CharField(
        source="uploaded_by.username", read_only=True,
    )

    ALLOWED_CONTENT_TYPES = {"image/jpeg", "image/png", "image/webp", "image/heic", "image/heif"}
    MAX_BYTES = 25 * 1024 * 1024

    class Meta:
        model = VehicleGalleryPhoto
        fields = [
            "id",
            "vehicle",
            "image",
            "image_url",
            "caption",
            "sort_order",
            "uploaded_by",
            "uploaded_by_username",
            "created_at",
            "updated_at",
        ]
        read_only_fields = [
            "id",
            "vehicle",
            "image_url",
            "uploaded_by",
            "uploaded_by_username",
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

    def get_image_url(self, obj: VehicleGalleryPhoto) -> str:
        request = self.context.get("request")
        if obj.image and hasattr(obj.image, "url"):
            return request.build_absolute_uri(obj.image.url) if request else obj.image.url
        return ""


