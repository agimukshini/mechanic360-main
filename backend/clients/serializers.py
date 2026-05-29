"""
Serializers for client management.

These implement the "tenants can register clients" requirement.
"""
from __future__ import annotations

from rest_framework import serializers

from .models import Client


class ClientSerializer(serializers.ModelSerializer):
    """
    Basic serializer for client records.

    Tenants can freely create/update/delete their own clients.
    """

    class Meta:
        model = Client
        fields = [
            "id",
            "type",
            "name",
            "company_name",
            "email",
            "phone",
            "preferred_channel",
            "global_owner_id",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["id", "global_owner_id", "created_at", "updated_at"]
