from django.db import migrations


def set_platform_onboarding_phone(apps, schema_editor):
    PlatformIssuerProfile = apps.get_model("global_vehicles", "PlatformIssuerProfile")
    profile, _ = PlatformIssuerProfile.objects.get_or_create(singleton_id=1)
    profile.phone = "+38344378288"
    profile.save(update_fields=["phone"])


def noop_reverse(apps, schema_editor):
    pass


class Migration(migrations.Migration):

    dependencies = [
        ("global_vehicles", "0010_platform_contact_branding"),
    ]

    operations = [
        migrations.RunPython(set_platform_onboarding_phone, noop_reverse),
    ]
