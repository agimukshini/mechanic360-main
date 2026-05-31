from django.conf import settings
from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        ("tenancy", "0005_subscription_plan_default_none"),
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]

    operations = [
        migrations.AddField(
            model_name="workshoptenant",
            name="business_registration_number",
            field=models.CharField(
                blank=True,
                db_index=True,
                help_text="ARBK Numri Unik Identifikues (NUI).",
                max_length=9,
            ),
        ),
        migrations.AddField(
            model_name="tenantonboardingapplication",
            name="business_registration_number",
            field=models.CharField(
                blank=True,
                db_index=True,
                help_text="ARBK Numri Unik Identifikues (NUI).",
                max_length=9,
            ),
        ),
        migrations.AddField(
            model_name="tenantonboardingapplication",
            name="verification_code",
            field=models.CharField(blank=True, db_index=True, max_length=8),
        ),
        migrations.AddField(
            model_name="tenantonboardingapplication",
            name="verification_code_confirmed_at",
            field=models.DateTimeField(blank=True, null=True),
        ),
        migrations.AddField(
            model_name="tenantonboardingapplication",
            name="verification_code_confirmed_by",
            field=models.ForeignKey(
                blank=True,
                null=True,
                on_delete=django.db.models.deletion.SET_NULL,
                related_name="confirmed_onboarding_verification_codes",
                to="accounts.user",
            ),
        ),
        migrations.AddField(
            model_name="tenantonboardingapplication",
            name="verification_code_channel",
            field=models.CharField(
                blank=True,
                choices=[("email", "Email"), ("phone", "Phone")],
                max_length=8,
            ),
        ),
        migrations.AddField(
            model_name="tenantonboardingapplication",
            name="verification_code_note",
            field=models.TextField(blank=True),
        ),
    ]
