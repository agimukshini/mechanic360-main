"""
Helpers for keeping the tenant's local CRM (`Client`) in sync with the
platform-wide identity (`GlobalOwner`).

Per `VEHICLE_SHARING_POLICY.md` §2.3: workshop Client rows are tenant-local
CRM entries that may reference a global_owner_id when matched. We never
duplicate the identity — if a GlobalOwner exists, the local Client is a
shadow that points at it. The shadow remains in the workshop's address
book even after the global owner sells the vehicle, so the workshop's
"this person came in on day X" memory persists.
"""
from __future__ import annotations

from typing import Optional

from django.db import connection

from .models import Client


def ensure_client_for_global_owner(global_owner) -> Optional[Client]:
    """
    Find or lazily create a tenant-local `Client` mirroring a platform-wide
    `GlobalOwner`. Must be called from inside the tenant's schema context
    (the request middleware sets this up automatically for API calls).

    Returns the Client, or `None` when `global_owner` is falsy.

    Idempotent: subsequent calls with the same global owner return the same
    Client row, with name / email / phone refreshed from the latest global
    state so the workshop's CRM stays consistent across the platform.
    """
    if global_owner is None:
        return None
    if connection.schema_name == "public":
        # Refusing to write a tenant-only row into public is a defensive
        # guard — should never happen in production code paths but a
        # mistaken call from a script would otherwise pollute the public
        # schema.
        return None

    owner_id = getattr(global_owner, "id", None) or getattr(global_owner, "pk", None)
    if not owner_id:
        return None

    name = (getattr(global_owner, "name", "") or "").strip()
    email = (getattr(global_owner, "email", "") or "").strip()
    phone = (getattr(global_owner, "phone", "") or "").strip()

    client = Client.objects.filter(global_owner_id=owner_id).first()
    if client is not None:
        # Keep CRM in sync with the global identity. Don't overwrite local
        # extras like preferred_channel — those are workshop-specific.
        dirty: list[str] = []
        if name and client.name != name:
            client.name = name
            dirty.append("name")
        if client.email != email:
            client.email = email
            dirty.append("email")
        if client.phone != phone:
            client.phone = phone
            dirty.append("phone")
        if dirty:
            client.save(update_fields=dirty + ["updated_at"])
        return client

    return Client.objects.create(
        type=Client.INDIVIDUAL,
        name=name or "Owner",
        email=email,
        phone=phone,
        global_owner_id=owner_id,
    )
