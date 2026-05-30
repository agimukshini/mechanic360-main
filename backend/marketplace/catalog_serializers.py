"""
Serializers for the marketplace catalog (sellers, parts, issues).
"""
from __future__ import annotations

from rest_framework import serializers

from .models import (
    MarketplaceSeller,
    PartCategory,
    SparePart,
    VehicleCompatibility,
    VehicleIssue,
)


class PartCategorySerializer(serializers.ModelSerializer):
    class Meta:
        model = PartCategory
        fields = ["id", "slug", "name", "parent", "description", "sort_order"]


class VehicleIssueSerializer(serializers.ModelSerializer):
    mapped_category_slugs = serializers.SerializerMethodField()

    class Meta:
        model = VehicleIssue
        fields = [
            "id",
            "slug",
            "name",
            "description",
            "sort_order",
            "mapped_category_slugs",
        ]

    def get_mapped_category_slugs(self, obj: VehicleIssue) -> list[str]:
        return list(obj.mapped_categories.values_list("slug", flat=True))


class VehicleCompatibilitySerializer(serializers.ModelSerializer):
    class Meta:
        model = VehicleCompatibility
        fields = [
            "id",
            "make",
            "model",
            "year_from",
            "year_to",
            "engine",
            "trim",
            "compatibility_source",
            "confidence_score",
            "notes",
        ]
        read_only_fields = fields


class MarketplaceSellerSerializer(serializers.ModelSerializer):
    seller_type_display = serializers.CharField(
        source="get_seller_type_display", read_only=True,
    )

    class Meta:
        model = MarketplaceSeller
        fields = [
            "id",
            "seller_type",
            "seller_type_display",
            "business_name",
            "tenant",
            "location_city",
            "location_country",
            "contact_phone",
            "contact_whatsapp",
            "contact_email",
            "membership_plan",
            "billing_status",
            "is_approved",
            "approved_at",
            "suspension_reason",
            "created_at",
            "updated_at",
        ]
        read_only_fields = [
            "id",
            "seller_type",
            "tenant",
            "is_approved",
            "approved_at",
            "membership_plan",
            "billing_status",
            "created_at",
            "updated_at",
        ]


class MarketplaceSellerWriteSerializer(serializers.ModelSerializer):
    class Meta:
        model = MarketplaceSeller
        fields = [
            "business_name",
            "location_city",
            "location_country",
            "contact_phone",
            "contact_whatsapp",
            "contact_email",
        ]


class SparePartListSerializer(serializers.ModelSerializer):
    category_slug = serializers.CharField(source="category.slug", read_only=True)
    category_name = serializers.CharField(source="category.name", read_only=True)
    listing_type_display = serializers.CharField(
        source="get_listing_type_display", read_only=True,
    )
    seller_name = serializers.CharField(source="seller.business_name", read_only=True)
    seller_city = serializers.SerializerMethodField()
    seller_country = serializers.CharField(source="seller.location_country", read_only=True)
    is_sponsored = serializers.SerializerMethodField()
    compatibilities = VehicleCompatibilitySerializer(many=True, read_only=True)
    contact_phone = serializers.SerializerMethodField()
    contact_whatsapp = serializers.SerializerMethodField()
    contact_email = serializers.SerializerMethodField()
    is_own = serializers.SerializerMethodField()

    class Meta:
        model = SparePart
        fields = [
            "id",
            "listing_type",
            "listing_type_display",
            "part_number",
            "oem_number",
            "brand",
            "alternative_numbers",
            "category",
            "category_slug",
            "category_name",
            "title",
            "description",
            "condition",
            "quantity",
            "price",
            "currency",
            "photos",
            "location_city_override",
            "is_active",
            "is_promoted",
            "is_sponsored",
            "is_own",
            "seller",
            "seller_name",
            "seller_city",
            "seller_country",
            "contact_phone",
            "contact_whatsapp",
            "contact_email",
            "compatibilities",
            "created_at",
            "updated_at",
        ]
        read_only_fields = fields

    def get_seller_city(self, obj: SparePart) -> str:
        if obj.location_city_override:
            return obj.location_city_override
        return obj.seller.location_city

    def get_is_sponsored(self, obj: SparePart) -> bool:
        return bool(obj.is_promoted)

    def get_contact_phone(self, obj: SparePart) -> str:
        return obj.seller.contact_phone

    def get_contact_whatsapp(self, obj: SparePart) -> str:
        return obj.seller.contact_whatsapp

    def get_contact_email(self, obj: SparePart) -> str:
        return obj.seller.contact_email

    def get_is_own(self, obj: SparePart) -> bool:
        request = self.context.get("request")
        if request is None or not getattr(request.user, "tenant_id", None):
            return False
        from .services import get_workshop_seller

        seller = get_workshop_seller(request.user.tenant)
        return seller is not None and obj.seller_id == seller.id


class SparePartWriteSerializer(serializers.ModelSerializer):
    alternative_numbers = serializers.ListField(
        child=serializers.CharField(max_length=64),
        required=False,
        allow_empty=True,
    )

    class Meta:
        model = SparePart
        fields = [
            "listing_type",
            "part_number",
            "oem_number",
            "brand",
            "alternative_numbers",
            "category",
            "title",
            "description",
            "condition",
            "quantity",
            "price",
            "currency",
            "photos",
            "location_city_override",
            "is_active",
        ]

    def validate_part_number(self, value: str) -> str:
        return value.strip().upper()

    def validate_oem_number(self, value: str) -> str:
        return value.strip().upper()

    def validate_brand(self, value: str) -> str:
        return value.strip()

    def validate_alternative_numbers(self, value: list[str]) -> list[str]:
        cleaned = []
        seen = set()
        for raw in value:
            token = raw.strip().upper()
            if not token or token in seen:
                continue
            seen.add(token)
            cleaned.append(token)
        return cleaned[:20]

    def validate(self, attrs):
        listing_type = attrs.get(
            "listing_type",
            getattr(self.instance, "listing_type", SparePart.ListingType.GENERIC),
        )
        part_number = attrs.get(
            "part_number",
            getattr(self.instance, "part_number", "") or "",
        ).strip()
        oem_number = attrs.get(
            "oem_number",
            getattr(self.instance, "oem_number", "") or "",
        ).strip()

        if listing_type == SparePart.ListingType.IDENTIFIED:
            if not part_number and not oem_number:
                raise serializers.ValidationError(
                    {
                        "oem_number": (
                            "Provide an OEM number and/or a supplier part number "
                            "for catalog-identified listings."
                        ),
                    },
                )
            attrs["part_number"] = part_number.upper() if part_number else ""
            attrs["oem_number"] = oem_number.upper() if oem_number else ""
        else:
            # Generic listings — strip identifiers so search stays honest.
            attrs["part_number"] = ""
            attrs["oem_number"] = ""
            attrs["alternative_numbers"] = []

        return attrs

    def validate_quantity(self, value: int) -> int:
        if value < 1:
            raise serializers.ValidationError("Quantity must be at least 1.")
        return value


class AdminPartSuspendSerializer(serializers.Serializer):
    reason = serializers.CharField(max_length=255)
