"""Public API for forgot / reset password."""
from __future__ import annotations

from rest_framework import permissions, status
from rest_framework.response import Response
from rest_framework.views import APIView

from mechanic360.throttling import AuthAnonRateThrottle

from .password_reset_services import (
    get_password_reset_token,
    password_reset_preview,
    request_password_reset,
    reset_password_with_token,
)
from .password_reset_serializers import (
    PasswordForgotSerializer,
    PasswordResetSerializer,
)


class PasswordForgotView(APIView):
    permission_classes = [permissions.AllowAny]
    throttle_classes = [AuthAnonRateThrottle]

    def post(self, request):
        serializer = PasswordForgotSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        token = request_password_reset(
            email=serializer.validated_data["email"],
            request=request,
        )
        if token is not None:
            from .celery_tasks import send_password_reset_email_task

            send_password_reset_email_task.delay(str(token.id))
        return Response(
            {
                "detail": (
                    "If an account exists for that email, a password reset link has been sent."
                ),
            },
            status=status.HTTP_200_OK,
        )


class PasswordResetPreviewView(APIView):
    permission_classes = [permissions.AllowAny]

    def get(self, request, token_id: str):
        token = get_password_reset_token(token_id)
        return Response(password_reset_preview(token))


class PasswordResetConfirmView(APIView):
    permission_classes = [permissions.AllowAny]
    throttle_classes = [AuthAnonRateThrottle]

    def post(self, request, token_id: str):
        serializer = PasswordResetSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        user = reset_password_with_token(
            token_id=token_id,
            password=serializer.validated_data["password"],
            request=request,
        )
        return Response(
            {
                "detail": "Password updated. You can sign in now.",
                "username": user.username,
            },
            status=status.HTTP_200_OK,
        )
