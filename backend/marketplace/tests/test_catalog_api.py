"""
Tests for marketplace catalog API (Phase A).
"""
from __future__ import annotations

from decimal import Decimal

from django.contrib.auth import get_user_model
from django.urls import reverse
from rest_framework import status
from rest_framework.test import APITestCase

from marketplace.models import MarketplaceSeller, PartCategory, SparePart
from tenancy.models import WorkshopTenant

User = get_user_model()


class MarketplaceCatalogApiTests(APITestCase):
    def setUp(self):
        self.category, _ = PartCategory.objects.get_or_create(
            slug="brake_pads_test",
            defaults={"name": "Brake pads"},
        )
        self.tenant_a = WorkshopTenant.objects.create(
            schema_name="shopa",
            name="Shop A",
            language="en",
            currency="EUR",
        )
        self.tenant_b = WorkshopTenant.objects.create(
            schema_name="shopb",
            name="Shop B",
            language="en",
            currency="EUR",
        )
        self.admin_a = User.objects.create_user(
            username="admin_a",
            email="admin_a@test.com",
            password="pass12345",
            role=User.Role.ADMIN,
            tenant=self.tenant_a,
        )
        self.mech_a = User.objects.create_user(
            username="mech_a",
            email="mech_a@test.com",
            password="pass12345",
            role=User.Role.MECHANIC,
            tenant=self.tenant_a,
        )
        self.admin_b = User.objects.create_user(
            username="admin_b",
            email="admin_b@test.com",
            password="pass12345",
            role=User.Role.ADMIN,
            tenant=self.tenant_b,
        )
        self.superadmin = User.objects.create_superuser(
            username="super",
            email="super@test.com",
            password="pass12345",
        )

        self.approved_seller = MarketplaceSeller.objects.create(
            seller_type=MarketplaceSeller.SellerType.WORKSHOP,
            business_name="Shop A Parts",
            tenant=self.tenant_a,
            is_approved=True,
        )
        self.pending_seller = MarketplaceSeller.objects.create(
            seller_type=MarketplaceSeller.SellerType.WORKSHOP,
            business_name="Shop B Parts",
            tenant=self.tenant_b,
            is_approved=False,
        )
        self.public_part = SparePart.objects.create(
            seller=self.approved_seller,
            category=self.category,
            title="Front brake pads",
            price=Decimal("45.00"),
            currency="EUR",
        )
        self.hidden_part = SparePart.objects.create(
            seller=self.pending_seller,
            category=self.category,
            title="Secret pads",
            price=Decimal("30.00"),
            currency="EUR",
        )

        self.parts_url = reverse("marketplace-parts-list")
        self.issues_url = reverse("marketplace-issues")
        self.seller_me_url = reverse("marketplace-seller-me")

    @staticmethod
    def _part_rows(response):
        data = response.data
        if isinstance(data, dict):
            return data.get("results", [])
        return data

    def test_mechanic_lists_only_approved_seller_parts(self):
        self.client.force_authenticate(user=self.mech_a)
        response = self.client.get(self.parts_url)

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        titles = {row["title"] for row in self._part_rows(response)}
        self.assertIn("Front brake pads", titles)
        self.assertNotIn("Secret pads", titles)

    def test_admin_previews_own_unapproved_parts(self):
        self.client.force_authenticate(user=self.admin_b)
        response = self.client.get(self.parts_url)

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        titles = {row["title"] for row in self._part_rows(response)}
        self.assertIn("Secret pads", titles)

    def test_admin_creates_part_for_workshop(self):
        self.client.force_authenticate(user=self.admin_a)
        response = self.client.post(
            self.parts_url,
            {
                "category": self.category.id,
                "title": "Rear pads",
                "price": "55.00",
                "currency": "EUR",
                "quantity": 2,
                "condition": "new",
            },
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertTrue(
            SparePart.objects.filter(seller=self.approved_seller, title="Rear pads").exists(),
        )

    def test_mechanic_cannot_create_part(self):
        self.client.force_authenticate(user=self.mech_a)
        response = self.client.post(
            self.parts_url,
            {
                "category": self.category.id,
                "title": "Blocked",
                "price": "10.00",
                "currency": "EUR",
                "quantity": 1,
                "condition": "new",
            },
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_issues_catalog_readable(self):
        self.client.force_authenticate(user=self.mech_a)
        response = self.client.get(self.issues_url)

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertTrue(len(response.data) >= 1)

    def test_superadmin_approves_seller(self):
        self.client.force_authenticate(user=self.superadmin)
        url = reverse(
            "marketplace-admin-seller-approve",
            kwargs={"pk": self.pending_seller.id},
        )
        response = self.client.post(url)

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.pending_seller.refresh_from_db()
        self.assertTrue(self.pending_seller.is_approved)

    def test_superadmin_suspends_part(self):
        self.client.force_authenticate(user=self.superadmin)
        url = reverse(
            "marketplace-admin-part-suspend",
            kwargs={"pk": self.public_part.id},
        )
        response = self.client.post(url, {"reason": "Counterfeit"}, format="json")

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.public_part.refresh_from_db()
        self.assertFalse(self.public_part.is_active)
        self.assertEqual(self.public_part.suspended_reason, "Counterfeit")

    def test_seller_me_create_and_get(self):
        tenant = WorkshopTenant.objects.create(
            schema_name="shopc",
            name="Shop C",
            language="en",
            currency="EUR",
        )
        admin = User.objects.create_user(
            username="admin_c",
            email="admin_c@test.com",
            password="pass12345",
            role=User.Role.ADMIN,
            tenant=tenant,
        )
        self.client.force_authenticate(user=admin)

        create = self.client.post(self.seller_me_url)
        self.assertEqual(create.status_code, status.HTTP_201_CREATED)
        self.assertFalse(create.data["is_approved"])

        fetch = self.client.get(self.seller_me_url)
        self.assertEqual(fetch.status_code, status.HTTP_200_OK)
        self.assertEqual(fetch.data["business_name"], "Shop C")

    def test_sponsored_flag_on_list(self):
        self.public_part.is_promoted = True
        self.public_part.save(update_fields=["is_promoted"])

        self.client.force_authenticate(user=self.mech_a)
        response = self.client.get(self.parts_url)

        row = next(r for r in self._part_rows(response) if r["title"] == "Front brake pads")
        self.assertTrue(row["is_sponsored"])

    def test_recommendations_require_params(self):
        self.client.force_authenticate(user=self.mech_a)
        url = reverse("marketplace-recommendations")
        response = self.client.get(url)
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_identified_part_requires_oem_or_part_number(self):
        self.client.force_authenticate(user=self.admin_a)
        response = self.client.post(
            self.parts_url,
            {
                "listing_type": "identified",
                "category": self.category.id,
                "title": "Identified without numbers",
                "price": "25.00",
                "currency": "EUR",
                "quantity": 1,
                "condition": "used",
            },
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("oem_number", response.data)

    def test_identified_part_stores_normalized_numbers(self):
        self.client.force_authenticate(user=self.admin_a)
        response = self.client.post(
            self.parts_url,
            {
                "listing_type": "identified",
                "category": self.category.id,
                "title": "OEM pads",
                "oem_number": "1k0 698 151",
                "part_number": "bp1234",
                "brand": "Bosch",
                "alternative_numbers": ["1K0698151", "1k0 698 151"],
                "price": "40.00",
                "currency": "EUR",
                "quantity": 2,
                "condition": "new",
            },
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        part = SparePart.objects.get(seller=self.approved_seller, title="OEM pads")
        self.assertEqual(part.listing_type, SparePart.ListingType.IDENTIFIED)
        self.assertEqual(part.oem_number, "1K0 698 151")
        self.assertEqual(part.part_number, "BP1234")
        self.assertEqual(part.brand, "Bosch")
        self.assertEqual(part.alternative_numbers, ["1K0698151", "1K0 698 151"])

    def test_generic_part_strips_identifiers(self):
        self.client.force_authenticate(user=self.admin_a)
        response = self.client.post(
            self.parts_url,
            {
                "listing_type": "generic",
                "category": self.category.id,
                "title": "Used alternator — unknown PN",
                "oem_number": "SHOULD-STRIP",
                "part_number": "ALSO-STRIP",
                "alternative_numbers": ["X123"],
                "price": "80.00",
                "currency": "EUR",
                "quantity": 1,
                "condition": "used",
            },
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        part = SparePart.objects.get(
            seller=self.approved_seller,
            title="Used alternator — unknown PN",
        )
        self.assertEqual(part.listing_type, SparePart.ListingType.GENERIC)
        self.assertEqual(part.oem_number, "")
        self.assertEqual(part.part_number, "")
        self.assertEqual(part.alternative_numbers, [])

    def test_admin_updates_own_part(self):
        self.client.force_authenticate(user=self.admin_a)
        url = reverse("marketplace-parts-detail", kwargs={"pk": self.public_part.id})
        response = self.client.patch(
            url,
            {
                "title": "Updated brake pads",
                "listing_type": "identified",
                "oem_number": "ABC123",
                "price": "49.99",
            },
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.public_part.refresh_from_db()
        self.assertEqual(self.public_part.title, "Updated brake pads")
        self.assertEqual(self.public_part.oem_number, "ABC123")
        self.assertEqual(str(self.public_part.price), "49.99")

    def test_admin_cannot_update_other_workshop_part(self):
        self.client.force_authenticate(user=self.admin_b)
        url = reverse("marketplace-parts-detail", kwargs={"pk": self.public_part.id})
        response = self.client.patch(url, {"title": "Hijacked"}, format="json")
        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)

    def test_own_parts_flagged_for_seller_admin(self):
        self.client.force_authenticate(user=self.admin_a)
        response = self.client.get(self.parts_url)
        rows = self._part_rows(response)
        own = next(r for r in rows if r["title"] == "Front brake pads")
        self.assertTrue(own["is_own"])

    def test_parts_list_is_paginated(self):
        SparePart.objects.create(
            seller=self.approved_seller,
            category=self.category,
            title="Paginated extra part",
            price=Decimal("9.99"),
            currency="EUR",
        )
        self.client.force_authenticate(user=self.admin_a)
        response = self.client.get(self.parts_url, {"page": 1, "page_size": 1})
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertIn("results", response.data)
        self.assertIn("count", response.data)
        self.assertEqual(len(response.data["results"]), 1)
        self.assertGreaterEqual(response.data["count"], 2)
        self.assertIsNotNone(response.data["next"])

    def test_legacy_listing_mirrors_to_catalog(self):
        from marketplace.models import MarketplaceListing

        listing = MarketplaceListing.objects.create(
            tenant=self.tenant_b,
            title="Legacy mirror test",
            description="From old API",
            category="parts",
            price=Decimal("12.50"),
            quantity_available=1,
            currency="EUR",
            is_active=True,
        )
        part = SparePart.objects.filter(
            seller__tenant=self.tenant_b,
            title="Legacy mirror test",
        ).first()
        self.assertIsNotNone(part)
        self.assertTrue(part.is_active)
        seller = part.seller
        self.assertTrue(seller.is_approved)

        listing.is_active = False
        listing.save()
        part.refresh_from_db()
        self.assertFalse(part.is_active)
