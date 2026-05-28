# Generated for user profile preferences (Phase A — USER_PROFILE_MECHANICS_AND_AUDIT.md)

from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("accounts", "0004_alter_user_role"),
    ]

    operations = [
        migrations.AddField(
            model_name="user",
            name="phone",
            field=models.CharField(blank=True, default="", max_length=32),
        ),
        migrations.AddField(
            model_name="user",
            name="theme",
            field=models.CharField(
                choices=[("light", "Light"), ("dark", "Dark"), ("system", "System")],
                default="light",
                max_length=16,
            ),
        ),
        migrations.AddField(
            model_name="user",
            name="email_notifications",
            field=models.BooleanField(default=True),
        ),
        migrations.AddField(
            model_name="user",
            name="sms_notifications",
            field=models.BooleanField(default=False),
        ),
        migrations.AddField(
            model_name="user",
            name="whatsapp_notifications",
            field=models.BooleanField(default=False),
        ),
    ]
