"""
Cross-tenant audit helper.

Tenant code lives in its own schema; the audit log lives in the public schema.
This module is the single place that switches contexts, so every call site can
just say:

    log_vehicle_event(
        entity=VehicleAuditEvent.Entity.OWNERSHIP,
        action=VehicleAuditEvent.Action.TRANSFER_INITIATED,
        vehicle=vehicle,
        request=request,
        target_id=str(transfer.id),
        changes={...},
    )

The helper short-circuits when ``changes`` is empty and ``note`` is empty AND
the action is one of the "neutral" updates — so re-saving a form with no real
edits never adds noise rows.
"""
from __future__ import annotations

import logging
from typing import Any

from django.db import connection
from django_tenants.utils import schema_context
from rest_framework.request import Request

from .models import VehicleAuditEvent

logger = logging.getLogger(__name__)


_NEUTRAL_UPDATES = {
    VehicleAuditEvent.Action.UPDATED,
    VehicleAuditEvent.Action.BILLING_CHANGED,
}


def get_client_ip(request: Request | None) -> str | None:
    """Honour X-Forwarded-For from the reverse proxy (nginx-proxy-manager)."""
    if request is None:
        return None
    xff = request.META.get("HTTP_X_FORWARDED_FOR", "")
    if xff:
        return xff.split(",")[0].strip()
    return request.META.get("REMOTE_ADDR")


def actor_context(request: Request | None) -> dict[str, Any]:
    """Pull actor + transport metadata out of a DRF request."""
    if request is None or not getattr(request, "user", None) or not request.user.is_authenticated:
        return {
            "actor_user_id": None,
            "actor_username": "",
            "actor_role": "",
            "request_ip": None,
            "request_user_agent": "",
        }
    user = request.user
    return {
        "actor_user_id": getattr(user, "id", None),
        "actor_username": getattr(user, "username", "") or "",
        "actor_role": getattr(user, "role", "") or "",
        "request_ip": get_client_ip(request),
        "request_user_agent": (request.META.get("HTTP_USER_AGENT", "") or "")[:512],
    }


def vehicle_diff(
    before: dict[str, Any] | None,
    after: dict[str, Any] | None,
    *,
    fields: list[str] | None = None,
) -> dict[str, dict[str, Any]]:
    """
    Compute a {field: {"before": x, "after": y}} diff.

    Compares only ``fields`` when given (recommended for explicit auditing),
    otherwise compares the union of keys. Values that are equal-after-str
    coercion are skipped — Decimal('5.00') and '5.00' don't count as edits.
    """
    before = before or {}
    after = after or {}
    keys = fields if fields is not None else sorted(set(before) | set(after))
    out: dict[str, dict[str, Any]] = {}
    for k in keys:
        b = before.get(k)
        a = after.get(k)
        if str(b) == str(a):
            continue
        out[k] = {"before": b, "after": a}
    return out


def _resolve_tenant(request: Request | None) -> tuple[str, str]:
    """Best-effort tenant schema + name extraction."""
    schema = "public"
    name = ""

    tenant = getattr(connection, "tenant", None)
    if tenant is not None:
        schema = getattr(tenant, "schema_name", schema) or schema
        name = getattr(tenant, "name", "") or ""

    if request is not None and getattr(request, "user", None) and request.user.is_authenticated:
        user_tenant = getattr(request.user, "tenant", None)
        if user_tenant is not None:
            schema = getattr(user_tenant, "schema_name", schema) or schema
            name = getattr(user_tenant, "name", name) or name

    return schema, name


def log_vehicle_event(
    *,
    entity: str,
    action: str,
    vehicle: Any | None = None,
    global_vehicle_id: str | None = None,
    request: Request | None = None,
    target_id: str = "",
    changes: dict[str, Any] | None = None,
    note: str = "",
    explicit_tenant_schema: str | None = None,
    explicit_tenant_name: str | None = None,
    actor_user: Any | None = None,
) -> VehicleAuditEvent | None:
    """Write one `VehicleAuditEvent` in the public schema.

    Returns the event, or `None` when the call was suppressed as a no-op
    (UPDATED/BILLING_CHANGED with empty changes + empty note).
    """
    changes = changes or {}
    if action in _NEUTRAL_UPDATES and not changes and not note:
        return None

    tenant_schema, tenant_name = (
        explicit_tenant_schema or "",
        explicit_tenant_name or "",
    )
    if not tenant_schema:
        tenant_schema, tenant_name = _resolve_tenant(request)

    vehicle_tenant_id = None
    gv_id = global_vehicle_id

    if vehicle is not None:
        # Tenant Vehicle row: has both .id (tenant) and .global_vehicle_id.
        # Global vehicle row: only .id (which IS the global id).
        v_id = getattr(vehicle, "id", None)
        v_gid = getattr(vehicle, "global_vehicle_id", None)
        if v_gid is not None:
            vehicle_tenant_id = v_id
            gv_id = gv_id or v_gid
        else:
            gv_id = gv_id or v_id

    actor = actor_context(request)
    # Explicit actor_user fills in attribution for non-HTTP contexts
    # (background jobs, management commands, tests).
    if actor_user is not None and not actor["actor_user_id"]:
        actor = {
            "actor_user_id": getattr(actor_user, "id", None),
            "actor_username": getattr(actor_user, "username", "") or "",
            "actor_role": getattr(actor_user, "role", "") or "",
            "request_ip": actor["request_ip"],
            "request_user_agent": actor["request_user_agent"],
        }

    try:
        with schema_context("public"):
            return VehicleAuditEvent.objects.create(
                tenant_schema=tenant_schema or "public",
                tenant_name=tenant_name or "",
                vehicle_tenant_id=vehicle_tenant_id,
                global_vehicle_id=gv_id,
                entity=entity,
                action=action,
                target_id=target_id or "",
                changes=changes,
                note=note or "",
                **actor,
            )
    except Exception:  # pragma: no cover — never let audit kill the request
        logger.exception(
            "Failed to write vehicle audit event entity=%s action=%s",
            entity,
            action,
        )
        return None
