"""i18n coverage tests — run with: manage.py test --tag=i18n"""
from __future__ import annotations

from django.test import SimpleTestCase, tag

from mechanic360.i18n_coverage import build_translation_coverage_report


@tag("i18n")
class TranslationCoverageReportTests(SimpleTestCase):
    def test_report_shape_without_db(self):
        report = build_translation_coverage_report(include_tenant_catalog=False)
        self.assertIn("service_catalog", report)
        self.assertIn("frontend_locales", report)
        self.assertIn("en", report["frontend_locales"])
        self.assertIn("sq", report["frontend_locales"])
