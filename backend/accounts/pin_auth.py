"""
Quick PIN login — username + numeric PIN issues JWT cookies like password login.
"""
from __future__ import annotations

from django.contrib.auth import get_user_model
from rest_framework import serializers, status
from rest_framework.exceptions import AuthenticationFailed
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework_simplejwt.tokens import RefreshToken

from mechanic360.throttling import AuthAnonRateThrottle

from .cookie_auth import set_auth_cookies

User = get_user_model()


class PinLoginSerializer(serializers.Serializer):
    username = serializers.CharField()
    pin = serializers.CharField(min_length=4, max_length=6)

    def validate_pin(self, value: str) -> str:
        if not value.isdigit():
            raise serializers.ValidationError("PIN must contain only digits.")
        return value

    def validate(self, attrs):
        username = attrs["username"].strip()
        try:
            user = User.objects.get(username=username)
        except User.DoesNotExist:
            raise AuthenticationFailed("Invalid username or PIN.", code="authorization") from None

        if not user.is_active:
            raise AuthenticationFailed("Invalid username or PIN.", code="authorization")

        if not user.has_quick_pin or not user.check_quick_pin(attrs["pin"]):
            raise AuthenticationFailed("Invalid username or PIN.", code="authorization")

        attrs["user"] = user
        return attrs


class ThrottledPinTokenObtainView(APIView):
    """POST { username, pin } -> JWT access/refresh (httpOnly cookies set)."""

    permission_classes = [AllowAny]
    throttle_classes = [AuthAnonRateThrottle]

    def post(self, request, *args, **kwargs):
        serializer = PinLoginSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        user = serializer.validated_data["user"]
        refresh = RefreshToken.for_user(user)
        access = str(refresh.access_token)
        response = Response(
            {"access": access, "refresh": str(refresh)},
            status=status.HTTP_200_OK,
        )
        set_auth_cookies(response, access, str(refresh))
        return response
