"""
Superadmin API for platform issuer (our company) details on invoices.
"""
from __future__ import annotations

from rest_framework.response import Response
from rest_framework.views import APIView

from mechanic360.permissions import IsPlatformSuperuser

from .models import PlatformIssuerProfile
from .serializers import PlatformIssuerProfileSerializer


class AdminPlatformIssuerView(APIView):
    permission_classes = [IsPlatformSuperuser]

    def get(self, request):
        profile = PlatformIssuerProfile.load()
        return Response(PlatformIssuerProfileSerializer(profile).data)

    def patch(self, request):
        profile = PlatformIssuerProfile.load()
        serializer = PlatformIssuerProfileSerializer(profile, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        serializer.save(updated_by=request.user)
        return Response(PlatformIssuerProfileSerializer(profile).data)
