"""
Issue-based spare-part recommendations for the visit workflow banner.
"""
from __future__ import annotations

from django.db.models import Case, FloatField, Q, Value, When
from django.utils import timezone

from vehicles.models import Vehicle

from .models import MarketplaceBannerEvent, SparePart, VehicleIssue


DEFAULT_LIMIT = 6


def _visible_parts():
    return SparePart.objects.select_related("seller", "category").prefetch_related(
        "compatibilities",
    ).filter(
        is_active=True,
        suspended_at__isnull=True,
        seller__is_approved=True,
        seller__billing_status="active",
    )


def recommend_parts_for_vehicle(
    *,
    vehicle: Vehicle,
    issue_slug: str,
    limit: int = DEFAULT_LIMIT,
) -> tuple[list[SparePart], VehicleIssue | None]:
    try:
        issue = VehicleIssue.objects.prefetch_related("mapped_categories").get(
            slug=issue_slug,
        )
    except VehicleIssue.DoesNotExist:
        return [], None

    category_ids = list(issue.mapped_categories.values_list("id", flat=True))
    if not category_ids:
        return [], issue

    year = vehicle.year
    qs = (
        _visible_parts()
        .filter(category_id__in=category_ids)
        .filter(
            compatibilities__make__iexact=vehicle.make,
            compatibilities__model__iexact=vehicle.model,
            compatibilities__year_from__lte=year,
            compatibilities__year_to__gte=year,
        )
        .annotate(
            boost=Case(
                When(is_promoted=True, then=Value(1.0)),
                default=Value(0.0),
                output_field=FloatField(),
            ),
        )
        .order_by("-boost", "price")
        .distinct()[:limit]
    )
    parts = list(qs)
    if parts:
        return parts, issue

    # Fallback when sellers have not entered compatibility yet — still
    # category-scoped so the banner is useful during catalog onboarding.
    fallback = (
        _visible_parts()
        .filter(category_id__in=category_ids)
        .annotate(
            boost=Case(
                When(is_promoted=True, then=Value(1.0)),
                default=Value(0.0),
                output_field=FloatField(),
            ),
        )
        .order_by("-boost", "price")[:limit]
    )
    return list(fallback), issue


def record_banner_impression(
    *,
    request,
    vehicle: Vehicle | None,
    issue: VehicleIssue | None,
    parts: list[SparePart],
) -> MarketplaceBannerEvent:
    tenant = getattr(request.user, "tenant", None)
    schema = tenant.schema_name if tenant else ""
    return MarketplaceBannerEvent.objects.create(
        mechanic_tenant_schema=schema,
        mechanic_user_id=getattr(request.user, "id", None),
        vehicle_tenant_id=vehicle.id if vehicle else None,
        global_vehicle_id=getattr(vehicle, "global_vehicle_id", None),
        issue=issue,
        displayed_part_ids=[str(part.id) for part in parts],
    )


def record_banner_click(event: MarketplaceBannerEvent, part_id: str) -> None:
    event.clicked_part_id = part_id
    event.save(update_fields=["clicked_part_id"])


def record_banner_contact(event: MarketplaceBannerEvent) -> None:
    event.contact_clicked = True
    event.save(update_fields=["contact_clicked"])
