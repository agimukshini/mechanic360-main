"""
API views for authentication & user management.

These views align with Jira story MECH-7:
- JWT login/refresh are handled by SimpleJWT (wired in `api_urls.py`)
- `RegisterView` allows creating new users (e.g. by a tenant admin)
- `MeView` returns the current authenticated user's profile
- `SettingsView` handles user settings updates (profile, password, preferences)
"""
from __future__ import annotations

from django.contrib.auth import get_user_model
from rest_framework import generics, permissions, viewsets, status
from rest_framework.response import Response
from rest_framework.views import APIView

from mechanic360.permissions import IsTenantAdmin, IsAdvisorOrAdmin

from .serializers import (
    RegisterSerializer,
    TenantUserManageSerializer,
    UserSerializer,
    SettingsSerializer,
)
from .notifications import Notification

User = get_user_model()


class RegisterView(generics.CreateAPIView):
    """
    Create a staff account in the current tenant (tenant admins only).
    """

    queryset = User.objects.all()
    serializer_class = RegisterSerializer
    permission_classes = [IsTenantAdmin]

    def perform_create(self, serializer):
        tenant = self.request.user.tenant
        current_count = User.objects.filter(tenant=tenant).count()
        if current_count >= 5:
            from rest_framework.exceptions import ValidationError

            raise ValidationError(
                "User limit reached (5 accounts). Please contact Superadmin to request additional users."
            )
        serializer.save(tenant=tenant)

    def get_serializer_context(self):
        context = super().get_serializer_context()
        context["tenant"] = self.request.user.tenant
        return context


class MeView(APIView):
    """
    Return the currently authenticated user's profile.
    """

    permission_classes = [permissions.IsAuthenticated]

    def get(self, request, *args, **kwargs):
        serializer = UserSerializer(request.user)
        tenant_name = None
        language = "sq"
        currency = "EUR"
        if request.user.tenant:
            tenant_name = request.user.tenant.name
            language = request.user.tenant.language or "sq"
            currency = request.user.tenant.currency or "EUR"
        return Response({
            **serializer.data,
            "is_superuser": request.user.is_superuser,
            "tenant_name": tenant_name,
            "language": language,
            "currency": currency,
        })


class SettingsView(APIView):
    """
    Handle user settings updates (profile, password, preferences).
    
    GET: Return current user profile and settings
    PUT/PATCH: Update user profile and/or password
    """

    permission_classes = [permissions.IsAuthenticated]

    def get(self, request, *args, **kwargs):
        serializer = SettingsSerializer(request.user, context={"request": request})
        return Response(serializer.data)

    def patch(self, request, *args, **kwargs):
        serializer = SettingsSerializer(
            request.user,
            data=request.data,
            partial=True,
            context={"request": request},
        )
        if serializer.is_valid():
            serializer.save()
            return Response(serializer.data)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

    def put(self, request, *args, **kwargs):
        serializer = SettingsSerializer(
            request.user,
            data=request.data,
            context={"request": request},
        )
        if serializer.is_valid():
            serializer.save()
            return Response(serializer.data)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)


class TenantUserViewSet(viewsets.ModelViewSet):
    """
    Tenant-scoped user management for workshop admins.

    - Only tenant admins can access this viewset
    - Queryset is limited to users within the same tenant
    - Enforces a hard cap of 5 users per tenant (including the admin)
    """

    serializer_class = TenantUserManageSerializer
    permission_classes = [IsTenantAdmin]

    def get_queryset(self):
        """
        Restrict users to the current tenant only.
        """
        user = self.request.user
        return User.objects.filter(tenant=user.tenant).exclude(role=User.Role.OWNER)

    def perform_destroy(self, instance):
        if instance.id == self.request.user.id:
            from rest_framework.exceptions import ValidationError

            raise ValidationError("You cannot delete your own account.")
        super().perform_destroy(instance)

    def perform_create(self, serializer):
        """
        Enforce a maximum of 5 accounts per tenant.

        If the limit is reached, return a 400 with a clear message indicating
        that the tenant must contact Superadmin to increase the limit.
        """
        tenant = self.request.user.tenant
        current_count = User.objects.filter(tenant=tenant).count()
        if current_count >= 5:
            from rest_framework.exceptions import ValidationError

            raise ValidationError(
                "User limit reached (5 accounts). Please contact Superadmin to request additional users."
            )

        serializer.save(tenant=tenant)


class TenantMechanicsListView(APIView):
    """Active mechanics in the current workshop (for vehicle assignment)."""

    permission_classes = [IsAdvisorOrAdmin]

    def get(self, request, *args, **kwargs):
        mechanics = User.objects.filter(
            tenant=request.user.tenant,
            role=User.Role.MECHANIC,
            is_active=True,
        ).order_by("first_name", "last_name", "username")
        return Response(UserSerializer(mechanics, many=True).data)


class NotificationListView(generics.ListAPIView):
    """
    List notifications for the current user.
    """

    permission_classes = [permissions.IsAuthenticated]

    def get(self, request, *args, **kwargs):
        notifications = Notification.objects.filter(user=request.user).order_by("-created_at")[:20]
        data = [
            {
                "id": str(n.id),
                "title": n.title,
                "message": n.message,
                "type": n.type,
                "link": n.link,
                "is_read": n.is_read,
                "created_at": n.created_at,
            }
            for n in notifications
        ]
        unread_count = Notification.objects.filter(user=request.user, is_read=False).count()
        return Response({"notifications": data, "unread_count": unread_count})


class NotificationMarkReadView(generics.GenericAPIView):
    """
    Mark a notification as read.
    """

    permission_classes = [permissions.IsAuthenticated]

    def post(self, request, *args, **kwargs):
        try:
            notification = Notification.objects.get(user=request.user, id=kwargs["pk"])
            notification.is_read = True
            notification.save()
            return Response({"status": "ok"})
        except Notification.DoesNotExist:
            return Response({"error": "Notification not found"}, status=404)


