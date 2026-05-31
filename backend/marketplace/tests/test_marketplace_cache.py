"""Tests for marketplace Redis response caching."""
from __future__ import annotations

from decimal import Decimal

from django.core.cache import cache
from django.db import connection
from django.test import override_settings
from django.test.utils import CaptureQueriesContext
from django.urls import reverse
from rest_framework import status
from rest_framework.test import APITestCase

from marketplace.models import MarketplaceSeller, PartCategory, SparePart
from marketplace.tests.test_catalog_api import MarketplaceCatalogApiTests
from tenancy.models import WorkshopTenant

LOC_MEM_CACHES = {
    "default": {
        "BACKEND": "django.core.cache.backends.locmem.LocMemCache",
        "LOCATION": "marketplace-cache-tests",
    }
}


@override_settings(
    CACHES=LOC_MEM_CACHES,
    MARKETPLACE_CACHE_ENABLED=True,
    MARKETPLACE_CACHE_TTL=300,
)
class MarketplaceCacheTests(MarketplaceCatalogApiTests):
    def setUp(self):
        super().setUp()
        cache.clear()

    @staticmethod
    def _spare_part_queries(queries):
        return [
            q
            for q in queries
            if "marketplace_sparepart" in q["sql"].lower()
        ]

    def test_parts_list_uses_cache_on_repeat_request(self):
        self.client.force_authenticate(user=self.mech_a)
        first = self.client.get(self.parts_url)
        self.assertEqual(first.status_code, status.HTTP_200_OK)

        with CaptureQueriesContext(connection) as ctx:
            second = self.client.get(self.parts_url)

        self.assertEqual(second.status_code, status.HTTP_200_OK)
        self.assertEqual(first.data, second.data)
        self.assertEqual(len(self._spare_part_queries(ctx.captured_queries)), 0)

    def test_parts_list_cache_invalidates_on_part_update(self):
        self.client.force_authenticate(user=self.mech_a)
        self.client.get(self.parts_url)

        self.public_part.title = "Renamed pads"
        self.public_part.save(update_fields=["title", "updated_at"])

        with CaptureQueriesContext(connection) as ctx:
            response = self.client.get(self.parts_url)

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        titles = {row["title"] for row in self._part_rows(response)}
        self.assertIn("Renamed pads", titles)
        self.assertGreaterEqual(len(self._spare_part_queries(ctx.captured_queries)), 1)

    def test_issues_list_uses_cache(self):
        self.client.force_authenticate(user=self.mech_a)
        self.client.get(self.issues_url)

        with CaptureQueriesContext(connection) as ctx:
            response = self.client.get(self.issues_url)

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        issue_queries = [
            q for q in ctx.captured_queries if "marketplace_vehicleissue" in q["sql"].lower()
        ]
        self.assertEqual(len(issue_queries), 0)

    def test_mine_parts_bypasses_cache(self):
        self.client.force_authenticate(user=self.admin_a)
        url = f"{self.parts_url}?mine=1"
        self.client.get(url)

        with CaptureQueriesContext(connection) as ctx:
            response = self.client.get(url)

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertGreaterEqual(len(self._spare_part_queries(ctx.captured_queries)), 1)
