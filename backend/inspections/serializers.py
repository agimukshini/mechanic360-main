"""
Serializers for 360° vehicle inspections.

The core `Inspection` model lives in `vehicles.models` and already stores the
structured checklist JSON; these serializers expose it via DRF.
"""
from __future__ import annotations

from rest_framework import serializers

from vehicles.models import Inspection, Vehicle, ServiceVisit


class InspectionSerializer(serializers.ModelSerializer):
    vehicle_id = serializers.UUIDField(source="visit.vehicle.id", read_only=True)
    vehicle_label = serializers.SerializerMethodField()
    visit_id = serializers.UUIDField(source="visit.id", read_only=True)

    class Meta:
        model = Inspection
        fields = [
            "id",
            "visit",
            "visit_id",
            "vehicle_id",
            "vehicle_label",
            "performed_by",
            "performed_at",
            "data",
        ]
        read_only_fields = ["id", "performed_at", "vehicle_id", "vehicle_label", "visit_id"]

    def get_vehicle_label(self, obj: Inspection) -> str:
        v: Vehicle = obj.visit.vehicle
        return f"{v.license_plate} - {v.make} {v.model}"


class CreateInspectionSerializer(serializers.ModelSerializer):
    """
    Dedicated serializer for creating/updating an inspection via visit_id.
    """

    visit_id = serializers.UUIDField(write_only=True)

    class Meta:
        model = Inspection
        fields = [
            "id",
            "visit_id",
            "performed_by",
            "data",
        ]
        read_only_fields = ["id"]

    def validate_data(self, value):
        if not value or not isinstance(value, dict):
            raise serializers.ValidationError("Inspection checklist data is required.")
        has_values = any(
            isinstance(section, dict) and len(section) > 0 for section in value.values()
        )
        if not has_values:
            raise serializers.ValidationError(
                "Complete at least one inspection item before saving."
            )
        return value

    def create(self, validated_data):
        visit_id = validated_data.pop("visit_id")
        visit = ServiceVisit.objects.get(id=visit_id)
        if Inspection.objects.filter(visit_id=visit_id).exists():
            raise serializers.ValidationError(
                {"visit_id": "This visit already has an inspection. Edit the existing one."}
            )
        return Inspection.objects.create(visit=visit, **validated_data)

    def update(self, instance, validated_data):
        validated_data.pop("visit_id", None)
        for attr, value in validated_data.items():
            setattr(instance, attr, value)
        instance.save()
        return instance


