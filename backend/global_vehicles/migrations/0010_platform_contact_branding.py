from django.db import migrations


def set_platform_branding(apps, schema_editor):
    PlatformIssuerProfile = apps.get_model("global_vehicles", "PlatformIssuerProfile")
    profile, _ = PlatformIssuerProfile.objects.get_or_create(singleton_id=1)
    profile.email = "mekaniku360@scardustech.com"
    profile.website = "https://mekaniku360.com"
    if not profile.trade_name:
        profile.trade_name = "Mekaniku360"
    profile.save()


def noop_reverse(apps, schema_editor):
    pass


class Migration(migrations.Migration):

    dependencies = [
        ("global_vehicles", "0009_platform_issuer_profile"),
    ]

    operations = [
        migrations.RunPython(set_platform_branding, noop_reverse),
    ]
