"""
Tests for bilingual service catalog serialization.
"""
from __future__ import annotations

from django.contrib.auth import get_user_model
from django.db import connection
from django.test import TestCase

from tenancy.models import WorkshopTenant
from visits.models import ServiceCatalogItem
from visits.serializers import ServiceCatalogItemSerializer

User = get_user_model()


class ServiceCatalogI18nTests(TestCase):
    def setUp(self):
        self.tenant_sq = WorkshopTenant.objects.create(
            schema_name="catalogsq",
            name="Catalog SQ",
            language="sq",
        )
        self.tenant_en = WorkshopTenant.objects.create(
            schema_name="catalogen",
            name="Catalog EN",
            language="en",
        )
        self.user_sq = User.objects.create_user(
            username="catalog_sq",
            password="pass12345",
            role=User.Role.ADMIN,
            tenant=self.tenant_sq,
        )
        self.user_en = User.objects.create_user(
            username="catalog_en",
            password="pass12345",
            role=User.Role.ADMIN,
            tenant=self.tenant_en,
        )
        connection.set_schema(self.tenant_sq.schema_name)
        self.item = ServiceCatalogItem.objects.create(
            name="Oil Change",
            description="Replace engine oil and filter.",
            name_sq="Ndryshim vaji",
            description_sq="Zëvendëson vajin dhe filtrin e motorit.",
            default_duration_hours=0.5,
            default_price=45,
        )

    def tearDown(self):
        connection.set_schema("public")

    def test_serializer_returns_albanian_for_sq_tenant(self):
        request = type("Req", (), {"user": self.user_sq})()
        data = ServiceCatalogItemSerializer(
            self.item,
            context={"request": request},
        ).data

        self.assertEqual(data["name"], "Ndryshim vaji")
        self.assertEqual(data["description"], "Zëvendëson vajin dhe filtrin e motorit.")
        self.assertEqual(data["name_en"], "Oil Change")

    def test_serializer_returns_english_for_en_tenant(self):
        request = type("Req", (), {"user": self.user_en})()
        data = ServiceCatalogItemSerializer(
            self.item,
            context={"request": request},
        ).data

        self.assertEqual(data["name"], "Oil Change")
        self.assertEqual(data["description"], "Replace engine oil and filter.")
