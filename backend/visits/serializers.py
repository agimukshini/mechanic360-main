"""
Serializers for service visits, line items, and preventive maintenance plans.

The main `ServiceVisit` model lives in `vehicles.models`; here we provide
serializers to:
- view a visit with its basic fields
- attach services, materials, and labor lines
- configure preventive maintenance plans for vehicles

Note: InventoryItem is imported from inventory.models.
"""
from __future__ import annotations

from decimal import Decimal

from django.db import transaction
from django.db.models import Sum
from rest_framework import serializers

from inventory.models import InventoryItem
from accounts.serializers import UserSerializer
from vehicles.models import Vehicle, ServiceVisit
from clients.serializers import ClientSerializer
from .completion import baseline_mileage_km_for_vehicle
from .catalog_i18n import catalog_language_from_request
from .attribution import apply_performed_by_to_validated_data
from .models import (
    ServiceCatalogItem,
    VisitLaborLine,
    VisitMaterialLine,
    VisitServiceLine,
    PreventiveMaintenancePlan,
)


class ServiceVisitSerializer(serializers.ModelSerializer):
    """
    Full serializer for service visits.

    Exposes vehicle and client as nested read-only objects, and accepts
    vehicle_id and client_id for writes.
    """

    vehicle_id = serializers.UUIDField(write_only=True)
    vehicle = serializers.SerializerMethodField(read_only=True)
    client_id = serializers.UUIDField(write_only=True, required=False, allow_null=True)
    client = ClientSerializer(read_only=True)
    grand_total = serializers.SerializerMethodField()
    line_summary = serializers.SerializerMethodField()

    class Meta:
        model = ServiceVisit
        fields = [
            "id",
            "vehicle",
            "vehicle_id",
            "client",
            "client_id",
            "status",
            "mileage_km",
            "hour_meter",
            "service_date",
            "created_by",
            "notes",
            "grand_total",
            "line_summary",
            "created_at",
            "updated_at",
        ]
        read_only_fields = [
            "id",
            "vehicle",
            "client",
            "status",
            "created_by",
            "grand_total",
            "line_summary",
            "created_at",
            "updated_at",
        ]

    def _line_total(self, obj: ServiceVisit, relation: str) -> Decimal:
        agg = getattr(obj, relation).aggregate(total=Sum("total_price"))
        return agg["total"] or Decimal("0")

    def get_grand_total(self, obj: ServiceVisit) -> str:
        total = (
            self._line_total(obj, "service_lines")
            + self._line_total(obj, "material_lines")
            + self._line_total(obj, "labor_lines")
        )
        return f"{total:.2f}"

    def get_line_summary(self, obj: ServiceVisit) -> str:
        parts = []
        service_count = obj.service_lines.count()
        material_count = obj.material_lines.count()
        labor_count = obj.labor_lines.count()
        if service_count:
            first = obj.service_lines.first()
            label = first.description if first else "Services"
            parts.append(label if service_count == 1 else f"{service_count} services")
        if material_count:
            parts.append(f"{material_count} part{'s' if material_count != 1 else ''}")
        if labor_count:
            parts.append(f"{labor_count} labor")
        return ", ".join(parts) if parts else "No line items yet"

    def get_vehicle(self, obj: ServiceVisit) -> dict:
        v = obj.vehicle
        data = {
            "id": str(v.id),
            "license_plate": v.license_plate,
            "make": v.make,
            "model": v.model,
            "vin": v.vin,
            "description": getattr(v, "description", "") or "",
        }
        # Expose the *current* owner. We resolve in three layers:
        #   1. Tenant-local Vehicle.owner (clients.Client)
        #   2. Global registry — active GlobalOwner linked to this VIN
        # The global fallback is what makes the modern flow work, where a shop
        # has registered the vehicle and the owner only in the public schema
        # (no per-tenant Client mirror).
        owner = getattr(v, "owner", None)
        if owner is not None:
            data["owner"] = {
                "id": str(owner.id),
                "name": getattr(owner, "name", "") or "",
                "company_name": getattr(owner, "company_name", "") or "",
                "phone": getattr(owner, "phone", "") or "",
                "email": getattr(owner, "email", "") or "",
                "source": "local",
            }
        else:
            data["owner"] = None
            try:
                from visits.report_utils import vehicle_global_owner

                global_owner = vehicle_global_owner(v)
            except Exception:  # pragma: no cover — defensive
                global_owner = None
            if global_owner is not None:
                data["owner"] = {
                    "id": str(global_owner.id),
                    "name": getattr(global_owner, "name", "") or "",
                    "company_name": "",
                    "phone": getattr(global_owner, "phone", "") or "",
                    "email": getattr(global_owner, "email", "") or "",
                    "source": "global",
                }
        mechanic = getattr(v, "assigned_mechanic", None)
        if mechanic is not None:
            data["assigned_mechanic"] = UserSerializer(mechanic).data
        return data

    def create(self, validated_data):
        """
        Create a new service visit linked to the specified vehicle and client.
        """
        vehicle_id = validated_data.pop("vehicle_id")
        client_id = validated_data.pop("client_id", None)
        vehicle = Vehicle.objects.get(id=vehicle_id)

        # Resolve the client in three layers:
        #   1. Explicit client_id from the request body.
        #   2. The local Vehicle.owner FK if already set.
        #   3. Mirror the platform-wide GlobalOwner into this workshop's CRM
        #      so a vehicle that exists only in the global registry still
        #      surfaces its owner under /clients here. This is what the spec
        #      calls a "shadow" client — it persists even after the global
        #      owner sells the vehicle, preserving the workshop's memory of
        #      "this person walked into our bay on these dates".
        if client_id:
            from clients.models import Client
            client = Client.objects.get(id=client_id)
        elif vehicle.owner_id:
            client = vehicle.owner
        else:
            client = None
            try:
                from visits.report_utils import vehicle_global_owner
                from clients.services import ensure_client_for_global_owner

                global_owner = vehicle_global_owner(vehicle)
                client = ensure_client_for_global_owner(global_owner)
                if client is not None and vehicle.owner_id != client.id:
                    vehicle.owner = client
                    vehicle.save(update_fields=["owner", "updated_at"])
            except Exception:  # pragma: no cover — never block visit creation
                client = None

        validated_data["vehicle"] = vehicle
        validated_data["client"] = client

        mileage = validated_data.get("mileage_km") or 0
        if mileage <= 0:
            validated_data["mileage_km"] = baseline_mileage_km_for_vehicle(vehicle)

        # Set created_by from request user if available
        request = self.context.get("request")
        if request and hasattr(request, "user") and request.user.is_authenticated:
            validated_data["created_by"] = request.user

        return ServiceVisit.objects.create(**validated_data)

    def update(self, instance, validated_data):
        """
        Allow updating service visit fields.
        """
        vehicle_id = validated_data.pop("vehicle_id", None)
        if vehicle_id is not None:
            instance.vehicle = Vehicle.objects.get(id=vehicle_id)
            instance.client = instance.vehicle.owner

        for attr, value in validated_data.items():
            setattr(instance, attr, value)

        instance.save()
        return instance


class ServiceCatalogItemSerializer(serializers.ModelSerializer):
    class Meta:
        model = ServiceCatalogItem
        fields = [
            "id",
            "name",
            "description",
            "name_sq",
            "description_sq",
            "default_duration_hours",
            "default_price",
            "is_active",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["id", "created_at", "updated_at"]

    def to_representation(self, instance):
        data = super().to_representation(instance)
        if self._language() == "sq":
            if instance.name_sq:
                data["name"] = instance.name_sq
            if instance.description_sq:
                data["description"] = instance.description_sq
        data["name_en"] = instance.name
        data["description_en"] = instance.description
        return data

    def _language(self) -> str:
        request = self.context.get("request")
        return catalog_language_from_request(request)


class ServiceVisitSummarySerializer(serializers.ModelSerializer):
    """
    Lightweight serializer for showing visit context when listing line items
    or maintenance plans.
    """

    vehicle_id = serializers.UUIDField(source="vehicle.id", read_only=True)
    vehicle_label = serializers.SerializerMethodField()

    class Meta:
        model = ServiceVisit
        fields = [
            "id",
            "vehicle_id",
            "vehicle_label",
            "status",
            "mileage_km",
            "hour_meter",
            "service_date",
        ]

    def get_vehicle_label(self, obj: ServiceVisit) -> str:
        v: Vehicle = obj.vehicle
        return f"{v.license_plate} - {v.make} {v.model}"


class VisitServiceLineSerializer(serializers.ModelSerializer):
    visit = ServiceVisitSummarySerializer(read_only=True)
    visit_id = serializers.UUIDField(write_only=True)
    performed_by = UserSerializer(read_only=True)
    performed_by_id = serializers.CharField(required=False, allow_blank=True, write_only=True)

    class Meta:
        model = VisitServiceLine
        fields = [
            "id",
            "visit",
            "visit_id",
            "catalog_item",
            "description",
            "quantity",
            "unit_price",
            "total_price",
            "performed_by",
            "performed_by_id",
        ]
        read_only_fields = ["id", "performed_by"]

    def create(self, validated_data):
        visit_id = validated_data.pop("visit_id")
        visit = ServiceVisit.objects.get(id=visit_id)
        validated_data["visit"] = visit
        if not validated_data.get("description"):
            catalog_item = validated_data.get("catalog_item")
            if catalog_item is not None:
                validated_data["description"] = catalog_item.name
        apply_performed_by_to_validated_data(self, validated_data)
        return VisitServiceLine.objects.create(**validated_data)

    def update(self, instance, validated_data):
        validated_data.pop("visit_id", None)
        apply_performed_by_to_validated_data(self, validated_data)
        for attr, value in validated_data.items():
            setattr(instance, attr, value)
        instance.save()
        return instance


class VisitMaterialLineSerializer(serializers.ModelSerializer):
    visit = ServiceVisitSummarySerializer(read_only=True)
    visit_id = serializers.UUIDField(write_only=True)
    inventory_item_detail = serializers.SerializerMethodField(read_only=True)

    class Meta:
        model = VisitMaterialLine
        fields = [
            "id",
            "visit",
            "visit_id",
            "inventory_item",
            "inventory_item_detail",
            "quantity",
            "unit_price",
            "total_price",
        ]
        read_only_fields = ["id", "inventory_item_detail"]

    def validate(self, attrs):
        inventory_item = attrs.get("inventory_item")
        quantity = attrs.get("quantity", Decimal("1"))
        if inventory_item is None:
            raise serializers.ValidationError({"inventory_item": "Select an inventory item."})
        if quantity is None or quantity <= 0:
            raise serializers.ValidationError({"quantity": "Quantity must be greater than zero."})
        if inventory_item.current_stock < quantity:
            raise serializers.ValidationError(
                {
                    "quantity": (
                        f"Insufficient stock for {inventory_item.name}. "
                        f"Available: {inventory_item.current_stock}, requested: {quantity}."
                    )
                }
            )
        return attrs

    def create(self, validated_data):
        visit_id = validated_data.pop("visit_id")
        visit = ServiceVisit.objects.get(id=visit_id)
        validated_data["visit"] = visit
        inventory_item = validated_data["inventory_item"]
        quantity = validated_data["quantity"]

        with transaction.atomic():
            item = InventoryItem.objects.select_for_update().get(pk=inventory_item.pk)
            if item.current_stock < quantity:
                raise serializers.ValidationError(
                    {
                        "quantity": (
                            f"Insufficient stock for {item.name}. "
                            f"Available: {item.current_stock}, requested: {quantity}."
                        )
                    }
                )
            line = VisitMaterialLine.objects.create(**validated_data)
            item.current_stock = int(item.current_stock - quantity)
            item.save(update_fields=["current_stock", "updated_at"])
        return line

    def get_inventory_item_detail(self, obj: VisitMaterialLine) -> dict:
        item: InventoryItem = obj.inventory_item
        return {
            "id": str(item.id),
            "sku": item.sku,
            "name": item.name,
        }


class VisitLaborLineSerializer(serializers.ModelSerializer):
    visit = ServiceVisitSummarySerializer(read_only=True)
    visit_id = serializers.UUIDField(write_only=True)
    performed_by = UserSerializer(read_only=True)
    performed_by_id = serializers.CharField(required=False, allow_blank=True, write_only=True)

    class Meta:
        model = VisitLaborLine
        fields = [
            "id",
            "visit",
            "visit_id",
            "description",
            "hours",
            "hourly_rate",
            "total_price",
            "performed_by",
            "performed_by_id",
        ]
        read_only_fields = ["id", "performed_by"]

    def create(self, validated_data):
        visit_id = validated_data.pop("visit_id")
        visit = ServiceVisit.objects.get(id=visit_id)
        validated_data["visit"] = visit
        apply_performed_by_to_validated_data(self, validated_data)
        return VisitLaborLine.objects.create(**validated_data)

    def update(self, instance, validated_data):
        validated_data.pop("visit_id", None)
        apply_performed_by_to_validated_data(self, validated_data)
        for attr, value in validated_data.items():
            setattr(instance, attr, value)
        instance.save()
        return instance


class PreventiveMaintenancePlanSerializer(serializers.ModelSerializer):
    vehicle_label = serializers.SerializerMethodField(read_only=True)

    class Meta:
        model = PreventiveMaintenancePlan
        fields = [
            "id",
            "vehicle",
            "vehicle_label",
            "name",
            "interval_km",
            "interval_hours",
            "interval_days",
            "last_service_date",
            "last_mileage_km",
            "last_hours",
            "is_active",
            "notes",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["id", "created_at", "updated_at", "vehicle_label"]

    def get_vehicle_label(self, obj: PreventiveMaintenancePlan) -> str:
        v: Vehicle = obj.vehicle
        return f"{v.license_plate} - {v.make} {v.model}"


