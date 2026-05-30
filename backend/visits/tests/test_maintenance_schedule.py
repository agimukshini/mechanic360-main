"""Unit tests for preventive maintenance schedule helpers."""
from __future__ import annotations

from datetime import date
from types import SimpleNamespace

from django.test import SimpleTestCase

from visits.maintenance_schedule import (
    calculate_next_due,
    is_maintenance_due,
    season_date,
    upcoming_seasonal_targets,
)
from visits.models import PreventiveMaintenancePlan


class MaintenanceScheduleTests(SimpleTestCase):
    def _seasonal_plan(self, **overrides):
        defaults = {
            "schedule_mode": PreventiveMaintenancePlan.ScheduleMode.SEASONAL,
            "season_start_month": 11,
            "season_start_day": 1,
            "season_end_month": 4,
            "season_end_day": 15,
            "reminder_days_before": 14,
            "vehicle": SimpleNamespace(odometer_km=100_000, hour_meter=0),
        }
        defaults.update(overrides)
        return SimpleNamespace(**defaults)

    def test_season_date_clamps_invalid_day(self):
        self.assertEqual(season_date(2026, 2, 31), date(2026, 2, 28))

    def test_upcoming_seasonal_targets_include_winter_and_summer(self):
        plan = self._seasonal_plan()
        targets = upcoming_seasonal_targets(plan, today=date(2026, 9, 1))
        labels = {row["label"] for row in targets}
        self.assertIn("winter_tires", labels)
        self.assertIn("summer_tires", labels)

    def test_winter_reminder_is_due_before_season_start(self):
        plan = self._seasonal_plan()
        today = date(2026, 10, 20)
        next_due = calculate_next_due(plan, today=today)
        self.assertIsNotNone(next_due)
        due, reason = is_maintenance_due(plan, next_due, today=today)
        self.assertTrue(due)
        self.assertIn("Winter tires", reason)

    def test_interval_plan_uses_mileage(self):
        plan = SimpleNamespace(
            schedule_mode=PreventiveMaintenancePlan.ScheduleMode.INTERVAL,
            interval_km=10_000,
            last_mileage_km=90_000,
            interval_hours=None,
            last_hours=None,
            interval_days=None,
            last_service_date=None,
            vehicle=SimpleNamespace(odometer_km=99_600, hour_meter=0),
        )
        next_due = calculate_next_due(plan)
        due, reason = is_maintenance_due(plan, next_due)
        self.assertTrue(due)
        self.assertIn("400 km", reason)
