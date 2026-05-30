from django.db import migrations, models


def clear_default_trial_labels(apps, schema_editor):
    WorkshopTenant = apps.get_model("tenancy", "WorkshopTenant")
    WorkshopTenant.objects.filter(subscription_plan="trial").update(subscription_plan="none")


class Migration(migrations.Migration):

    dependencies = [
        ("tenancy", "0004_tenantonboardingapplication"),
    ]

    operations = [
        migrations.AlterField(
            model_name="workshoptenant",
            name="subscription_plan",
            field=models.CharField(default="none", max_length=64),
        ),
        migrations.RunPython(clear_default_trial_labels, migrations.RunPython.noop),
    ]
