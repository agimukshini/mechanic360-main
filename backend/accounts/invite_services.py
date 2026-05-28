"""Staff invite link creation and redemption."""
from __future__ import annotations

from django.conf import settings
from django.contrib.auth import get_user_model
from django.utils import timezone
from rest_framework.exceptions import ValidationError

from .invite_models import StaffInviteToken

User = get_user_model()
MAX_TENANT_USERS = 5
STAFF_INVITE_DAILY_LIMIT = 3
STAFF_INVITE_MONTHLY_LIMIT = 10


def frontend_base_url(request) -> str:
    configured = getattr(settings, "FRONTEND_BASE_URL", "").strip().rstrip("/")
    if configured:
        return configured
    origin = ""
    if request is not None:
        origin = (getattr(request, "headers", {}) or {}).get("Origin", "") or ""
        if not origin:
            referer = getattr(request, "META", {}).get("HTTP_REFERER", "")
            if referer:
                from urllib.parse import urlparse

                parsed = urlparse(referer)
                if parsed.scheme and parsed.netloc:
                    origin = f"{parsed.scheme}://{parsed.netloc}"
    return origin.rstrip("/") or "http://localhost:5173"


def staff_invite_path(token_id) -> str:
    return f"/invite/staff/{token_id}"


def staff_invite_absolute_url(request, token_id) -> str:
    return f"{frontend_base_url(request)}{staff_invite_path(token_id)}"


def _pending_invite_count(tenant) -> int:
    return StaffInviteToken.objects.filter(
        tenant=tenant,
        used_at__isnull=True,
        expires_at__gt=timezone.now(),
    ).count()


def _invite_usage(created_by) -> tuple[int, int]:
    now = timezone.now()
    day_start = now.replace(hour=0, minute=0, second=0, microsecond=0)
    month_start = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
    qs = StaffInviteToken.objects.filter(created_by=created_by)
    daily_used = qs.filter(created_at__gte=day_start).count()
    monthly_used = qs.filter(created_at__gte=month_start).count()
    return daily_used, monthly_used


def staff_invite_limits(created_by) -> dict:
    daily_used, monthly_used = _invite_usage(created_by)
    return {
        "daily_limit": STAFF_INVITE_DAILY_LIMIT,
        "daily_used": daily_used,
        "daily_remaining": max(0, STAFF_INVITE_DAILY_LIMIT - daily_used),
        "monthly_limit": STAFF_INVITE_MONTHLY_LIMIT,
        "monthly_used": monthly_used,
        "monthly_remaining": max(0, STAFF_INVITE_MONTHLY_LIMIT - monthly_used),
    }


def _ensure_user_capacity(tenant) -> None:
    if User.objects.filter(tenant=tenant).count() >= MAX_TENANT_USERS:
        raise ValidationError(
            "User limit reached (5 accounts). Please contact Superadmin to request additional users."
        )


def _ensure_invite_capacity(tenant) -> None:
    if User.objects.filter(tenant=tenant).count() + _pending_invite_count(tenant) >= MAX_TENANT_USERS:
        raise ValidationError(
            "User limit reached (5 accounts). Please contact Superadmin to request additional users."
        )


def _ensure_invite_rate_limits(created_by) -> None:
    daily_used, monthly_used = _invite_usage(created_by)
    if daily_used >= STAFF_INVITE_DAILY_LIMIT:
        raise ValidationError(
            f"Daily invite limit reached ({STAFF_INVITE_DAILY_LIMIT} per day). Try again tomorrow."
        )
    if monthly_used >= STAFF_INVITE_MONTHLY_LIMIT:
        raise ValidationError(
            f"Monthly invite limit reached ({STAFF_INVITE_MONTHLY_LIMIT} per month)."
        )


def create_staff_invite(
    *,
    tenant,
    created_by,
    email: str = "",
    first_name: str = "",
    last_name: str = "",
    role: str = User.Role.MECHANIC,
) -> StaffInviteToken:
    if role not in {User.Role.MECHANIC}:
        raise ValidationError({"role": "Role must be mechanic."})
    _ensure_invite_rate_limits(created_by)
    _ensure_invite_capacity(tenant)
    return StaffInviteToken.objects.create(
        tenant=tenant,
        created_by=created_by,
        email=email.strip(),
        first_name=first_name.strip(),
        last_name=last_name.strip(),
        role=role,
        expires_at=StaffInviteToken.default_expiry(),
    )


def get_staff_invite(token_id: str) -> StaffInviteToken:
    try:
        return StaffInviteToken.objects.select_related("tenant", "created_by").get(id=token_id)
    except (StaffInviteToken.DoesNotExist, ValueError) as exc:
        raise ValidationError("Invite link is invalid or no longer available.") from exc


def staff_invite_preview(token: StaffInviteToken) -> dict:
    status = "valid"
    if token.used_at is not None:
        status = "used"
    elif token.expires_at <= timezone.now():
        status = "expired"
    return {
        "token_id": str(token.id),
        "status": status,
        "workshop_name": token.tenant.name,
        "role": token.role,
        "email": token.email,
        "first_name": token.first_name,
        "last_name": token.last_name,
        "expires_at": token.expires_at,
    }


def accept_staff_invite(
    *,
    token_id: str,
    username: str,
    password: str,
    email: str = "",
    first_name: str = "",
    last_name: str = "",
) -> User:
    token = get_staff_invite(token_id)
    if token.used_at is not None:
        raise ValidationError("This invite link has already been used.")
    if token.expires_at <= timezone.now():
        raise ValidationError("This invite link has expired. Ask your workshop admin for a new one.")

    _ensure_user_capacity(token.tenant)

    username = username.strip()
    if User.objects.filter(username__iexact=username).exists():
        raise ValidationError({"username": "This username is already taken."})

    resolved_email = (email or token.email).strip()
    if resolved_email and User.objects.filter(email__iexact=resolved_email).exists():
        raise ValidationError({"email": "This email is already registered."})

    invite_role = token.role
    if invite_role == "service_advisor":
        invite_role = User.Role.MECHANIC

    user = User(
        username=username,
        email=resolved_email,
        first_name=(first_name or token.first_name).strip(),
        last_name=(last_name or token.last_name).strip(),
        role=invite_role,
        tenant=token.tenant,
        is_active=True,
    )
    user.set_password(password)
    user.save()

    token.used_at = timezone.now()
    token.accepted_user = user
    token.save(update_fields=["used_at", "accepted_user"])

    return user
