# Generated for login audit trail (Phase B)

import uuid

import django.db.models.deletion
from django.conf import settings
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("accounts", "0005_user_profile_preferences"),
        ("tenancy", "0004_tenantonboardingapplication"),
    ]

    operations = [
        migrations.CreateModel(
            name="LoginAuditEvent",
            fields=[
                (
                    "id",
                    models.UUIDField(
                        default=uuid.uuid4,
                        editable=False,
                        primary_key=True,
                        serialize=False,
                    ),
                ),
                ("username_attempted", models.CharField(db_index=True, max_length=150)),
                (
                    "outcome",
                    models.CharField(
                        choices=[
                            ("success", "Success"),
                            ("failed_password", "Failed password"),
                            ("failed_pin", "Failed PIN"),
                            ("failed_unknown_user", "Unknown user"),
                            ("failed_inactive", "Inactive user"),
                            ("failed_tenant_inactive", "Inactive workshop"),
                        ],
                        db_index=True,
                        max_length=32,
                    ),
                ),
                (
                    "auth_method",
                    models.CharField(
                        choices=[
                            ("password", "Password"),
                            ("pin", "PIN"),
                            ("refresh", "Token refresh"),
                        ],
                        db_index=True,
                        max_length=16,
                    ),
                ),
                ("ip_address", models.GenericIPAddressField(blank=True, null=True)),
                ("user_agent", models.CharField(blank=True, default="", max_length=512)),
                ("created_at", models.DateTimeField(auto_now_add=True, db_index=True)),
                (
                    "tenant",
                    models.ForeignKey(
                        blank=True,
                        null=True,
                        on_delete=django.db.models.deletion.SET_NULL,
                        related_name="login_audit_events",
                        to="tenancy.workshoptenant",
                    ),
                ),
                (
                    "user",
                    models.ForeignKey(
                        blank=True,
                        null=True,
                        on_delete=django.db.models.deletion.SET_NULL,
                        related_name="login_audit_events",
                        to=settings.AUTH_USER_MODEL,
                    ),
                ),
            ],
            options={
                "verbose_name": "Login audit event",
                "verbose_name_plural": "Login audit events",
                "ordering": ["-created_at"],
            },
        ),
    ]
