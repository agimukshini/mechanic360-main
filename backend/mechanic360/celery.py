"""
Celery configuration for Mechanic360.

This sets up the Celery application used for background tasks and scheduled jobs.
"""
from __future__ import annotations

import os

from celery import Celery
from django.conf import settings

# Set the default Django settings module for the 'celery' program.
os.environ.setdefault("DJANGO_SETTINGS_MODULE", "mechanic360.settings")

app = Celery("mechanic360")

# Using a string here means the worker doesn't have to serialize
# the configuration object to child processes.
app.config_from_object("django.conf:settings", namespace="CELERY")

# Load task modules from all registered Django app configs.
app.autodiscover_tasks()


@app.task(bind=True)
def debug_task(self):
    """Debug task for testing Celery connectivity."""
    print(f"Request: {self.request!r}")


# Celery Beat schedule configuration
CELERY_BEAT_SCHEDULE = {
    "check-preventive-maintenance-daily": {
        "task": "visits.celery_tasks.check_maintenance_due",
        "schedule": 86400,  # Run once per day (24 hours)
    },
}
