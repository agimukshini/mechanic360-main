"""Staff invite API views."""
from __future__ import annotations

from rest_framework import permissions, status
from rest_framework.response import Response
from rest_framework.views import APIView

from mechanic360.permissions import IsTenantAdmin

from .celery_tasks import send_staff_invite_email_task
from .invite_models import StaffInviteToken
from .invite_serializers import (
    StaffInviteAcceptSerializer,
    StaffInviteCreateSerializer,
    StaffInviteTokenSerializer,
)
from .invite_services import (
    accept_staff_invite,
    create_staff_invite,
    get_staff_invite,
    staff_invite_absolute_url,
    staff_invite_limits,
    staff_invite_preview,
)
from .serializers import UserSerializer


class TenantStaffInviteListCreateView(APIView):
    """Workshop admin creates and lists pending staff invite links."""

    permission_classes = [IsTenantAdmin]

    def get(self, request):
        invites = StaffInviteToken.objects.filter(
            tenant=request.user.tenant,
            used_at__isnull=True,
        ).select_related("tenant").order_by("-created_at")
        serializer = StaffInviteTokenSerializer(
            invites,
            many=True,
            context={"request": request},
        )
        return Response({
            "invites": serializer.data,
            "limits": staff_invite_limits(request.user),
        })

    def post(self, request):
        serializer = StaffInviteCreateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        invite = create_staff_invite(
            tenant=request.user.tenant,
            created_by=request.user,
            **serializer.validated_data,
        )
        data = StaffInviteTokenSerializer(invite, context={"request": request}).data
        data["invite_url"] = staff_invite_absolute_url(request, invite.id)
        data["limits"] = staff_invite_limits(request.user)
        if invite.email:
            send_staff_invite_email_task.delay(str(invite.id))
            data["email_queued"] = True
        else:
            data["email_queued"] = False
        return Response(data, status=status.HTTP_201_CREATED)


class StaffInvitePreviewView(APIView):
    """Public preview of an invite before account setup."""

    permission_classes = [permissions.AllowAny]

    def get(self, request, token_id: str):
        invite = get_staff_invite(token_id)
        return Response(staff_invite_preview(invite))


class StaffInviteAcceptView(APIView):
    """Public one-time redemption — creates the workshop user account."""

    permission_classes = [permissions.AllowAny]

    def post(self, request, token_id: str):
        serializer = StaffInviteAcceptSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        user = accept_staff_invite(token_id=token_id, **serializer.validated_data)
        return Response(
            {
                "detail": "Account created. You can sign in now.",
                "user": UserSerializer(user).data,
            },
            status=status.HTTP_201_CREATED,
        )
