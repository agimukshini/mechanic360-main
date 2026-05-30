"""Superadmin translation coverage API."""
from __future__ import annotations

from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from mechanic360.i18n_coverage import build_translation_coverage_report
from mechanic360.permissions import IsPlatformSuperuser


class TranslationCoverageView(APIView):
    permission_classes = [IsAuthenticated, IsPlatformSuperuser]

    def get(self, request):
        return Response(build_translation_coverage_report())
