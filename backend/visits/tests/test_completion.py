"""Tests for visit completion validation and vehicle odometer updates."""
from __future__ import annotations

from django.core.exceptions import ValidationError
from django.test import SimpleTestCase

from visits.completion import assert_visit_has_inspection, inspection_has_content


class InspectionHasContentTests(SimpleTestCase):
    def test_empty_data_is_false(self):
        class FakeInspection:
            data = {}

        self.assertFalse(inspection_has_content(FakeInspection()))

    def test_section_with_items_is_true(self):
        class FakeInspection:
            data = {"exterior": {"lights": {"status": "pass"}}}

        self.assertTrue(inspection_has_content(FakeInspection()))


class AssertVisitHasInspectionTests(SimpleTestCase):
    def test_missing_inspection_raises(self):
        class FakeVisit:
            pass

        with self.assertRaises(ValidationError):
            assert_visit_has_inspection(FakeVisit())  # type: ignore[arg-type]
