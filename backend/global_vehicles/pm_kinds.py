"""Shared preventive-maintenance service categories."""
from __future__ import annotations

from django.db import models


class PMKind(models.TextChoices):
    REGULAR = "regular_service", "Regular service"
    MAJOR = "major_service", "Major service"
    TIRE = "tire_change", "Tire change"
