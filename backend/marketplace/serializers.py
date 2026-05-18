"""
Serializers for marketplace listings.
"""
from __future__ import annotations

from rest_framework import serializers

from .models import MarketplaceListing


class MarketplaceListingSerializer(serializers.ModelSerializer):
    """
    Serializer for marketplace listings.
    Excludes sensitive tenant data - only shows workshop name and location.
    """

    tenant_name = serializers.CharField(source='tenant.name', read_only=True)
    tenant_address = serializers.CharField(source='tenant.address', read_only=True)
    tenant_contact_phone = serializers.CharField(source='tenant.contact_phone', read_only=True)
    tenant_contact_email = serializers.CharField(source='tenant.contact_email', read_only=True)

    class Meta:
        model = MarketplaceListing
        fields = [
            'id',
            'tenant',
            'tenant_name',
            'tenant_address',
            'tenant_contact_phone',
            'tenant_contact_email',
            'title',
            'description',
            'category',
            'price',
            'quantity_available',
            'currency',
            'contact_phone',
            'contact_whatsapp',
            'contact_email',
            'is_active',
            'is_sold',
            'created_at',
            'updated_at',
        ]
        read_only_fields = ['id', 'tenant', 'created_at', 'updated_at']
