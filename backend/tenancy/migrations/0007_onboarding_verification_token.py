import uuid

import django.db.models.deletion
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("tenancy", "0006_workshop_kyc_verification"),
    ]

    operations = [
        migrations.AlterField(
            model_name="tenantonboardingapplication",
            name="verification_code_channel",
            field=models.CharField(
                blank=True,
                choices=[
                    ("email", "Email"),
                    ("phone", "Phone"),
                    ("email_link", "Email link (one-click)"),
                ],
                max_length=16,
            ),
        ),
        migrations.CreateModel(
            name="OnboardingVerificationToken",
            fields=[
                ("id", models.UUIDField(default=uuid.uuid4, editable=False, primary_key=True, serialize=False)),
                ("expires_at", models.DateTimeField()),
                ("clicked_at", models.DateTimeField(blank=True, null=True)),
                ("click_ip", models.CharField(blank=True, default="", max_length=64)),
                ("click_user_agent", models.CharField(blank=True, default="", max_length=512)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                (
                    "application",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="verification_tokens",
                        to="tenancy.tenantonboardingapplication",
                    ),
                ),
            ],
            options={
                "ordering": ["-created_at"],
            },
        ),
    ]
