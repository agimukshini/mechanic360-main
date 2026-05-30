from __future__ import annotations

from rest_framework import serializers

from .models import PreventiveMaintenanceOrder
from .pm_kinds import PMKind


class PreventiveMaintenanceOrderSerializer(serializers.ModelSerializer):
    pm_kind_display = serializers.CharField(source="get_pm_kind_display", read_only=True)
    status_display = serializers.CharField(source="get_status_display", read_only=True)
    vehicle_label = serializers.SerializerMethodField()
    vehicle_vin = serializers.CharField(source="global_vehicle.vin", read_only=True)
    vehicle_plate = serializers.CharField(source="global_vehicle.license_plate", read_only=True)
    vehicle_make = serializers.CharField(source="global_vehicle.make", read_only=True)
    vehicle_model = serializers.CharField(source="global_vehicle.model", read_only=True)
    vehicle_year = serializers.IntegerField(source="global_vehicle.year", read_only=True)

    class Meta:
        model = PreventiveMaintenanceOrder
        fields = [
            "id",
            "global_vehicle",
            "pm_kind",
            "pm_kind_display",
            "status",
            "status_display",
            "due_date",
            "due_odometer_km",
            "title",
            "notes",
            "vehicle_label",
            "vehicle_vin",
            "vehicle_plate",
            "vehicle_make",
            "vehicle_model",
            "vehicle_year",
            "created_by_tenant",
            "source_plan_id",
            "completed_at",
            "completed_by_tenant",
            "created_at",
            "updated_at",
        ]
        read_only_fields = [
            "id",
            "created_by_tenant",
            "source_plan_id",
            "completed_at",
            "completed_by_tenant",
            "created_at",
            "updated_at",
            "pm_kind_display",
            "status_display",
            "vehicle_label",
            "vehicle_vin",
            "vehicle_plate",
            "vehicle_make",
            "vehicle_model",
            "vehicle_year",
        ]

    def get_vehicle_label(self, obj: PreventiveMaintenanceOrder) -> str:
        gv = obj.global_vehicle
        return f"{gv.license_plate} — {gv.make} {gv.model} ({gv.year})"


class PreventiveMaintenanceOrderWriteSerializer(serializers.ModelSerializer):
    global_vehicle_id = serializers.UUIDField(write_only=True)
    local_vehicle_id = serializers.UUIDField(write_only=True, required=False)

    class Meta:
        model = PreventiveMaintenanceOrder
        fields = [
            "global_vehicle_id",
            "local_vehicle_id",
            "pm_kind",
            "due_date",
            "due_odometer_km",
            "title",
            "notes",
        ]

    def validate_pm_kind(self, value: str) -> str:
        if value not in PMKind.values:
            raise serializers.ValidationError("Invalid preventive maintenance type.")
        return value

    def validate(self, attrs):
        request = self.context.get("request")
        tenant = getattr(getattr(request, "user", None), "tenant", None)
        pm_kind = attrs.get("pm_kind")
        if tenant and pm_kind:
            from .pm_services import get_tenant_offered_pm_kinds

            if pm_kind not in get_tenant_offered_pm_kinds(tenant):
                raise serializers.ValidationError(
                    {
                        "pm_kind": (
                            "Your workshop does not offer this service type. "
                            "Tag a catalog service with the matching PM type first."
                        ),
                    },
                )
        return attrs

    def create(self, validated_data):
        validated_data.pop("local_vehicle_id", None)
        global_vehicle_id = validated_data.pop("global_vehicle_id")
        request = self.context["request"]
        return PreventiveMaintenanceOrder.objects.create(
            global_vehicle_id=global_vehicle_id,
            created_by_tenant=request.user.tenant,
            created_by=request.user,
            **validated_data,
        )
