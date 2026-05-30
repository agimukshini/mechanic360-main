"""Seasonal and interval fields for preventive maintenance plans."""

from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("visits", "0007_pm_kind_fields"),
    ]

    operations = [
        migrations.AddField(
            model_name="preventivemaintenanceplan",
            name="schedule_mode",
            field=models.CharField(
                choices=[
                    ("interval", "Interval (km / days / hours)"),
                    ("seasonal", "Seasonal (month-day window)"),
                ],
                default="interval",
                help_text="Interval counters or fixed seasonal month-day windows.",
                max_length=16,
            ),
        ),
        migrations.AddField(
            model_name="preventivemaintenanceplan",
            name="season_start_month",
            field=models.PositiveSmallIntegerField(
                blank=True,
                help_text="Month when the seasonal period starts (1–12), e.g. 11 for November.",
                null=True,
            ),
        ),
        migrations.AddField(
            model_name="preventivemaintenanceplan",
            name="season_start_day",
            field=models.PositiveSmallIntegerField(
                blank=True,
                help_text="Day when the seasonal period starts (1–31).",
                null=True,
            ),
        ),
        migrations.AddField(
            model_name="preventivemaintenanceplan",
            name="season_end_month",
            field=models.PositiveSmallIntegerField(
                blank=True,
                help_text="Month when the seasonal period ends (1–12), e.g. 4 for April.",
                null=True,
            ),
        ),
        migrations.AddField(
            model_name="preventivemaintenanceplan",
            name="season_end_day",
            field=models.PositiveSmallIntegerField(
                blank=True,
                help_text="Last day of the seasonal period (1–31).",
                null=True,
            ),
        ),
        migrations.AddField(
            model_name="preventivemaintenanceplan",
            name="reminder_days_before",
            field=models.PositiveSmallIntegerField(
                default=14,
                help_text="How many days before the target date to start reminders.",
            ),
        ),
    ]
