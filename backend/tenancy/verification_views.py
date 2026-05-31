"""Public API for onboarding one-click email verification."""
from __future__ import annotations

from rest_framework import permissions, status
from rest_framework.response import Response
from rest_framework.views import APIView

from .verification_services import (
    confirm_onboarding_via_email_link,
    get_verification_token,
    verification_token_preview,
)


class OnboardingVerificationPreviewView(APIView):
    permission_classes = [permissions.AllowAny]

    def get(self, request, token_id: str):
        token = get_verification_token(token_id)
        return Response(verification_token_preview(token))


class OnboardingVerificationConfirmView(APIView):
    permission_classes = [permissions.AllowAny]

    def post(self, request, token_id: str):
        application = confirm_onboarding_via_email_link(token_id, request=request)
        return Response(
            {
                "detail": "Verification recorded. A platform administrator will call your official business phone.",
                "application_id": str(application.id),
                "workshop_name": application.workshop_name,
                "verification_confirmed_at": application.verification_code_confirmed_at,
                "verification_channel": application.verification_code_channel,
            },
            status=status.HTTP_200_OK,
        )
