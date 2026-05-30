"""Due-date helpers for preventive maintenance plans (interval + seasonal)."""
from __future__ import annotations

import calendar
from datetime import date, timedelta

from visits.models import PreventiveMaintenancePlan


def season_date(year: int, month: int, day: int) -> date:
    """Build a calendar date, clamping day to the month's length."""
    max_day = calendar.monthrange(year, month)[1]
    return date(year, month, min(day, max_day))


def upcoming_seasonal_targets(plan: PreventiveMaintenancePlan, today: date | None = None) -> list[dict]:
    """
    Return upcoming seasonal reminders (winter + summer tire changes).

    ``season_start`` = first day winter tires are required.
    ``season_end`` = last day winter tires are required; summer starts the next day.
    """
    today = today or date.today()
    if not (
        plan.season_start_month
        and plan.season_start_day
        and plan.season_end_month
        and plan.season_end_day
    ):
        return []

    reminder_days = plan.reminder_days_before or 14
    sm, sd = plan.season_start_month, plan.season_start_day
    em, ed = plan.season_end_month, plan.season_end_day
    targets: list[dict] = []

    for base_year in (today.year - 1, today.year, today.year + 1):
        winter_start = season_date(base_year, sm, sd)
        winter_end = season_date(base_year, em, ed)
        if winter_start > winter_end:
            winter_end = season_date(base_year + 1, em, ed)

        summer_start = winter_end + timedelta(days=1)

        for target_date, label in (
            (winter_start, "winter_tires"),
            (summer_start, "summer_tires"),
        ):
            reminder_date = target_date - timedelta(days=reminder_days)
            grace_end = target_date + timedelta(days=30)
            if reminder_date <= today <= grace_end or reminder_date >= today:
                targets.append(
                    {
                        "reminder_date": reminder_date,
                        "target_date": target_date,
                        "grace_end": grace_end,
                        "label": label,
                    },
                )

    targets.sort(key=lambda row: row["reminder_date"])
    deduped: list[dict] = []
    seen: set[tuple[date, str]] = set()
    for row in targets:
        key = (row["target_date"], row["label"])
        if key in seen:
            continue
        seen.add(key)
        deduped.append(row)
    return deduped


def calculate_interval_next_due(plan: PreventiveMaintenancePlan) -> dict | None:
    next_due: dict = {}
    if plan.interval_km and plan.last_mileage_km is not None:
        next_due["mileage"] = plan.last_mileage_km + plan.interval_km
    if plan.interval_hours and plan.last_hours is not None:
        next_due["hours"] = plan.last_hours + plan.interval_hours
    if plan.interval_days and plan.last_service_date:
        next_due["date"] = plan.last_service_date + timedelta(days=plan.interval_days)
    return next_due or None


def calculate_seasonal_next_due(plan: PreventiveMaintenancePlan, today: date | None = None) -> dict | None:
    today = today or date.today()
    candidates = upcoming_seasonal_targets(plan, today)
    if not candidates:
        return None

    active = [
        row
        for row in candidates
        if row["reminder_date"] <= today <= row["grace_end"]
    ]
    if active:
        row = active[0]
    else:
        future = [row for row in candidates if row["reminder_date"] >= today]
        if not future:
            return None
        row = future[0]

    return {
        "date": row["target_date"],
        "reminder_date": row["reminder_date"],
        "seasonal_label": row["label"],
        "seasonal_target": row["target_date"],
    }


def calculate_next_due(plan: PreventiveMaintenancePlan, today: date | None = None) -> dict | None:
    if plan.schedule_mode == PreventiveMaintenancePlan.ScheduleMode.SEASONAL:
        return calculate_seasonal_next_due(plan, today)
    return calculate_interval_next_due(plan)


def is_interval_due(plan: PreventiveMaintenancePlan, next_due: dict) -> tuple[bool, str]:
    vehicle = plan.vehicle

    if "mileage" in next_due:
        km_remaining = next_due["mileage"] - (vehicle.odometer_km or 0)
        if km_remaining <= 500:
            if km_remaining <= 0:
                return True, f"Overdue by {abs(km_remaining)} km"
            return True, f"Due in {km_remaining} km"

    if "hours" in next_due:
        hours_remaining = next_due["hours"] - (vehicle.hour_meter or 0)
        if hours_remaining <= 10:
            if hours_remaining <= 0:
                return True, f"Overdue by {abs(hours_remaining)} hours"
            return True, f"Due in {hours_remaining} hours"

    if "date" in next_due:
        days_remaining = (next_due["date"] - date.today()).days
        if days_remaining <= 7:
            if days_remaining <= 0:
                return True, f"Overdue by {abs(days_remaining)} days"
            return True, f"Due in {days_remaining} days"

    return False, ""


def is_seasonal_due(plan: PreventiveMaintenancePlan, next_due: dict, today: date | None = None) -> tuple[bool, str]:
    today = today or date.today()
    reminder_date = next_due.get("reminder_date")
    target_date = next_due.get("seasonal_target") or next_due.get("date")
    label_key = next_due.get("seasonal_label", "seasonal")
    if not reminder_date or not target_date:
        return False, ""

    label = "Winter tires" if label_key == "winter_tires" else "Summer tires"
    if today < reminder_date:
        return False, ""

    if today <= target_date:
        days = (target_date - today).days
        if days == 0:
            return True, f"{label} due today"
        return True, f"{label} due in {days} days"

    overdue = (today - target_date).days
    if overdue <= 30:
        return True, f"{label} overdue by {overdue} days"
    return False, ""


def is_maintenance_due(plan: PreventiveMaintenancePlan, next_due: dict, today: date | None = None) -> tuple[bool, str]:
    if plan.schedule_mode == PreventiveMaintenancePlan.ScheduleMode.SEASONAL:
        return is_seasonal_due(plan, next_due, today)
    return is_interval_due(plan, next_due)
