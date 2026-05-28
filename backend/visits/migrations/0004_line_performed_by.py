# Per-visit line mechanic attribution

import django.db.models.deletion
from django.conf import settings
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("visits", "0003_service_catalog_i18n"),
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]

    operations = [
        migrations.AddField(
            model_name="visitserviceline",
            name="performed_by",
            field=models.ForeignKey(
                blank=True,
                help_text="Mechanic who performed this service line.",
                null=True,
                on_delete=django.db.models.deletion.SET_NULL,
                related_name="service_lines_performed",
                to=settings.AUTH_USER_MODEL,
            ),
        ),
        migrations.AddField(
            model_name="visitlaborline",
            name="performed_by",
            field=models.ForeignKey(
                blank=True,
                help_text="Mechanic who performed this labor line.",
                null=True,
                on_delete=django.db.models.deletion.SET_NULL,
                related_name="labor_lines_performed",
                to=settings.AUTH_USER_MODEL,
            ),
        ),
    ]
