"""Unit tests for service report PDF helpers."""
from __future__ import annotations

from types import SimpleNamespace
from unittest.mock import Mock

from django.test import SimpleTestCase

from visits.report_utils import (
    client_display_name,
    mechanic_display_name,
    visit_customer_client,
    visit_mechanic_user,
)


class ReportUtilsTests(SimpleTestCase):
    def test_visit_customer_prefers_vehicle_owner(self):
        owner = SimpleNamespace(type="individual", name="Owner Person", company_name="")
        visit_client = SimpleNamespace(type="individual", name="Wrong Client", company_name="")
        visit = SimpleNamespace(
            vehicle=SimpleNamespace(owner=owner),
            client=visit_client,
        )
        self.assertIs(visit_customer_client(visit), owner)
        self.assertEqual(client_display_name(visit_customer_client(visit)), "Owner Person")

    def test_mechanic_prefers_inspection_performer(self):
        performer = Mock()
        performer.get_full_name.return_value = "Mechanic One"
        performer.username = "mech1"
        creator = Mock()
        creator.get_full_name.return_value = "Admin User"
        creator.username = "admin"
        inspection = SimpleNamespace(performed_by=performer)
        visit = SimpleNamespace(created_by=creator, client=None, vehicle=None)
        self.assertIs(visit_mechanic_user(visit, inspection), performer)

    def test_mechanic_name_differs_from_customer_when_names_match(self):
        performer = Mock()
        performer.get_full_name.return_value = "John Smith"
        performer.username = "jsmith"
        inspection = SimpleNamespace(performed_by=performer)
        visit = SimpleNamespace(created_by=performer, client=None, vehicle=None)
        name = mechanic_display_name(visit, inspection, customer_name="John Smith")
        self.assertEqual(name, "jsmith")
