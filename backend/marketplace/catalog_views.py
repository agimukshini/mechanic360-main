"""
Catalog API views for the marketplace (Phase A).

Mechanic-facing browse, seller self-service, and superadmin approval gates.
Legacy `MarketplaceListing` CRUD remains in `views.py`.
"""
from __future__ import annotations

from django.db.models import Q
from django.utils import timezone
from rest_framework import filters, status, viewsets
from rest_framework.exceptions import NotFound, PermissionDenied
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from mechanic360.permissions import IsPlatformSuperuser, IsTenantAdmin, IsTenantUser

from .cache import cache_get, cache_get_or_set, cache_set, marketplace_cache_key
from .catalog_serializers import (
    AdminPartSuspendSerializer,
    MarketplaceSellerSerializer,
    MarketplaceSellerWriteSerializer,
    PartCategorySerializer,
    SparePartListSerializer,
    SparePartWriteSerializer,
    VehicleIssueSerializer,
)
from .models import MarketplaceBannerEvent, MarketplaceSeller, PartCategory, SparePart, VehicleIssue
from .pagination import MarketplacePartPagination
from .permissions import IsSellerPartOwner
from .recommendations import (
    record_banner_click,
    record_banner_contact,
    record_banner_impression,
    recommend_parts_for_vehicle,
)
from .services import get_or_create_workshop_seller, get_workshop_seller
from vehicles.models import Vehicle


def _mechanic_visible_parts():
    """Parts from approved, active sellers only."""
    return (
        SparePart.objects.select_related("seller", "category")
        .prefetch_related("compatibilities")
        .filter(
            is_active=True,
            suspended_at__isnull=True,
            seller__is_approved=True,
            seller__billing_status="active",
        )
    )


def _is_public_visible_part(part: SparePart) -> bool:
    seller = part.seller
    return (
        part.is_active
        and part.suspended_at is None
        and seller.is_approved
        and seller.billing_status == "active"
    )


def _parts_list_cache_scope(request) -> str | None:
    """Return cache scope key, or None when the response must not be cached."""
    if request.query_params.get("mine") == "1":
        return None
    tenant = getattr(request.user, "tenant", None)
    if tenant is None:
        return "public"
    if get_workshop_seller(tenant) is not None:
        return f"tenant:{tenant.pk}"
    return "public"


class VehicleIssueListView(APIView):
    """Issue taxonomy for the recommendation engine (read-only)."""

    permission_classes = [IsAuthenticated, IsTenantUser]

    def get(self, request):
        cache_key = marketplace_cache_key("issues")
        cached = cache_get(cache_key)
        if cached is not None:
            return Response(cached)

        issues = VehicleIssue.objects.prefetch_related("mapped_categories").all()
        data = VehicleIssueSerializer(issues, many=True).data
        cache_set(cache_key, data)
        return Response(data)


class SellerMeView(APIView):
    """
    Workshop seller profile for the authenticated tenant admin.

    GET  — current profile (404 if not registered yet)
    POST — create profile (starts unapproved)
    PATCH — update contact/location fields
    """

    permission_classes = [IsAuthenticated, IsTenantAdmin]

    def _seller(self, request) -> MarketplaceSeller:
        seller = get_workshop_seller(request.user.tenant)
        if seller is None:
            raise NotFound("Your workshop has not registered as a marketplace seller yet.")
        return seller

    def get(self, request):
        seller = self._seller(request)
        return Response(MarketplaceSellerSerializer(seller).data)

    def post(self, request):
        if get_workshop_seller(request.user.tenant) is not None:
            return Response(
                {"detail": "Seller profile already exists."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        seller, _created = get_or_create_workshop_seller(request.user.tenant)
        return Response(
            MarketplaceSellerSerializer(seller).data,
            status=status.HTTP_201_CREATED,
        )

    def patch(self, request):
        seller = self._seller(request)
        serializer = MarketplaceSellerWriteSerializer(
            seller, data=request.data, partial=True,
        )
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return Response(MarketplaceSellerSerializer(seller).data)


class SparePartViewSet(viewsets.ModelViewSet):
    """
    Spare-part catalog.

    - List/retrieve: any workshop user; only approved-seller parts shown
      unless the requester owns the seller (draft preview for admins).
    - Create/update/delete: tenant admin for their workshop seller only.
    """

    permission_classes = [IsAuthenticated, IsTenantUser, IsSellerPartOwner]
    pagination_class = MarketplacePartPagination
    filter_backends = [filters.SearchFilter, filters.OrderingFilter]
    search_fields = [
        "title",
        "description",
        "part_number",
        "oem_number",
        "alternative_numbers",
        "seller__business_name",
    ]
    ordering_fields = ["created_at", "price", "title"]
    ordering = ["-is_promoted", "-created_at"]

    def get_serializer_class(self):
        if self.action in {"create", "update", "partial_update"}:
            return SparePartWriteSerializer
        return SparePartListSerializer

    def get_queryset(self):
        user = self.request.user
        own_seller = get_workshop_seller(user.tenant) if user.tenant_id else None

        if self.action in {"update", "partial_update", "destroy"}:
            if own_seller is None:
                return SparePart.objects.none()
            return SparePart.objects.filter(seller=own_seller).select_related(
                "seller", "category",
            ).prefetch_related("compatibilities")

        params = self.request.query_params
        if params.get("mine") == "1" and own_seller is not None:
            return (
                SparePart.objects.filter(seller=own_seller)
                .select_related("seller", "category")
                .prefetch_related("compatibilities")
                .order_by("-created_at")
            )

        base = _mechanic_visible_parts()
        if own_seller is not None:
            # Admins preview their unapproved/inactive parts alongside public catalog.
            own_parts = (
                SparePart.objects.filter(seller=own_seller)
                .select_related("seller", "category")
                .prefetch_related("compatibilities")
            )
            base = (base | own_parts).distinct()

        params = self.request.query_params
        category = params.get("category")
        if category:
            base = base.filter(category__slug=category)

        condition = params.get("condition")
        if condition:
            base = base.filter(condition=condition)

        make = params.get("make")
        model = params.get("model")
        year = params.get("year")
        if make:
            base = base.filter(compatibilities__make__iexact=make)
        if model:
            base = base.filter(compatibilities__model__iexact=model)
        if year:
            try:
                year_int = int(year)
            except ValueError:
                pass
            else:
                base = base.filter(
                    compatibilities__year_from__lte=year_int,
                    compatibilities__year_to__gte=year_int,
                )

        part_number = params.get("part_number")
        if part_number:
            base = base.filter(
                Q(part_number__iexact=part_number)
                | Q(oem_number__iexact=part_number)
                | Q(alternative_numbers__contains=[part_number])
            )

        oem = params.get("oem")
        if oem:
            base = base.filter(
                Q(oem_number__iexact=oem) | Q(alternative_numbers__contains=[oem])
            )

        city = params.get("city")
        if city:
            base = base.filter(
                Q(location_city_override__icontains=city)
                | Q(seller__location_city__icontains=city)
            )

        price_min = params.get("price_min")
        price_max = params.get("price_max")
        if price_min:
            base = base.filter(price__gte=price_min)
        if price_max:
            base = base.filter(price__lte=price_max)

        seller_id = params.get("seller")
        if seller_id:
            base = base.filter(seller_id=seller_id)

        return base

    def list(self, request, *args, **kwargs):
        scope = _parts_list_cache_scope(request)
        if scope is not None:
            cache_key = marketplace_cache_key(
                "parts-list",
                scope=scope,
                params=sorted(request.query_params.items()),
            )
            cached = cache_get(cache_key)
            if cached is not None:
                return Response(cached)

        response = super().list(request, *args, **kwargs)
        if scope is not None and response.status_code == status.HTTP_200_OK:
            cache_set(cache_key, response.data)
        return response

    def retrieve(self, request, *args, **kwargs):
        lookup_url_kwarg = self.lookup_url_kwarg or self.lookup_field
        part_id = self.kwargs.get(lookup_url_kwarg)
        cache_key = marketplace_cache_key("parts-detail", part_id=str(part_id))

        cached = cache_get(cache_key)
        if cached is not None:
            return Response(cached)

        response = super().retrieve(request, *args, **kwargs)
        if response.status_code == status.HTTP_200_OK:
            part = self.get_object()
            if _is_public_visible_part(part):
                cache_set(cache_key, response.data)
        return response

    def perform_create(self, serializer):
        if not IsTenantAdmin().has_permission(self.request, self):
            raise PermissionDenied("Only workshop admins can list spare parts.")
        seller = get_workshop_seller(self.request.user.tenant)
        if seller is None:
            seller, _ = get_or_create_workshop_seller(self.request.user.tenant)
        serializer.save(seller=seller)

    def perform_update(self, serializer):
        if not IsTenantAdmin().has_permission(self.request, self):
            raise PermissionDenied("Only workshop admins can edit spare parts.")
        serializer.save()

    def perform_destroy(self, instance):
        if not IsTenantAdmin().has_permission(self.request, self):
            raise PermissionDenied("Only workshop admins can remove spare parts.")
        instance.is_active = False
        instance.save(update_fields=["is_active", "updated_at"])


class AdminSellerApproveView(APIView):
    """Superadmin approves a seller so their parts become visible."""

    permission_classes = [IsAuthenticated, IsPlatformSuperuser]

    def post(self, request, pk):
        try:
            seller = MarketplaceSeller.objects.get(pk=pk)
        except MarketplaceSeller.DoesNotExist as exc:
            raise NotFound("Seller not found.") from exc

        seller.is_approved = True
        seller.approved_at = timezone.now()
        seller.approved_by = request.user
        seller.suspension_reason = ""
        seller.save(
            update_fields=[
                "is_approved",
                "approved_at",
                "approved_by",
                "suspension_reason",
                "updated_at",
            ],
        )
        return Response(MarketplaceSellerSerializer(seller).data)


class AdminPartSuspendView(APIView):
    """Superadmin suspends a part listing."""

    permission_classes = [IsAuthenticated, IsPlatformSuperuser]

    def post(self, request, pk):
        try:
            part = SparePart.objects.select_related("seller").get(pk=pk)
        except SparePart.DoesNotExist as exc:
            raise NotFound("Part not found.") from exc

        serializer = AdminPartSuspendSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        part.is_active = False
        part.suspended_at = timezone.now()
        part.suspended_reason = serializer.validated_data["reason"]
        part.save(
            update_fields=[
                "is_active",
                "suspended_at",
                "suspended_reason",
                "updated_at",
            ],
        )
        return Response(SparePartListSerializer(part).data)


class PartCategoryListView(APIView):
    permission_classes = [IsAuthenticated, IsTenantUser]

    def get(self, request):
        cache_key = marketplace_cache_key("categories")
        cached = cache_get(cache_key)
        if cached is not None:
            return Response(cached)

        categories = PartCategory.objects.filter(parent__isnull=False).order_by(
            "sort_order", "name",
        )
        data = PartCategorySerializer(categories, many=True).data
        cache_set(cache_key, data)
        return Response(data)


class RecommendationView(APIView):
    """Banner payload: compatible spare parts for a vehicle + issue."""

    permission_classes = [IsAuthenticated, IsTenantUser]

    def get(self, request):
        vehicle_id = request.query_params.get("vehicle")
        issue_slug = request.query_params.get("issue")
        if not vehicle_id or not issue_slug:
            return Response(
                {"detail": "Query params `vehicle` and `issue` are required."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        try:
            vehicle = Vehicle.objects.get(pk=vehicle_id)
        except Vehicle.DoesNotExist as exc:
            raise NotFound("Vehicle not found.") from exc

        rec_key = marketplace_cache_key(
            "recommendations",
            issue=issue_slug,
            make=vehicle.make,
            model=vehicle.model,
            year=vehicle.year,
        )

        def load_recommendation_payload():
            parts, issue = recommend_parts_for_vehicle(
                vehicle=vehicle,
                issue_slug=issue_slug,
            )
            compatibility_confirmed = bool(
                parts
                and parts[0].compatibilities.filter(
                    make__iexact=vehicle.make,
                    model__iexact=vehicle.model,
                    year_from__lte=vehicle.year,
                    year_to__gte=vehicle.year,
                ).exists()
            )
            return {
                "issue": VehicleIssueSerializer(issue).data if issue else None,
                "compatibility_confirmed": compatibility_confirmed,
                "parts": SparePartListSerializer(parts, many=True).data,
                "displayed_part_ids": [str(part.id) for part in parts],
            }

        payload = cache_get_or_set(rec_key, load_recommendation_payload)
        displayed_part_ids = payload.pop("displayed_part_ids", [])
        issue = VehicleIssue.objects.filter(slug=issue_slug).first()
        event = record_banner_impression(
            request=request,
            vehicle=vehicle,
            issue=issue,
            displayed_part_ids=displayed_part_ids,
        )
        return Response(
            {
                "banner_event_id": str(event.id),
                **payload,
            },
        )


class BannerEventClickView(APIView):
    permission_classes = [IsAuthenticated, IsTenantUser]

    def post(self, request, event_id):
        part_id = request.data.get("part_id")
        if not part_id:
            return Response({"detail": "part_id is required."}, status=status.HTTP_400_BAD_REQUEST)
        try:
            event = MarketplaceBannerEvent.objects.get(pk=event_id)
        except MarketplaceBannerEvent.DoesNotExist as exc:
            raise NotFound("Banner event not found.") from exc
        record_banner_click(event, str(part_id))
        return Response({"ok": True})


class BannerEventContactView(APIView):
    permission_classes = [IsAuthenticated, IsTenantUser]

    def post(self, request, event_id):
        try:
            event = MarketplaceBannerEvent.objects.get(pk=event_id)
        except MarketplaceBannerEvent.DoesNotExist as exc:
            raise NotFound("Banner event not found.") from exc
        record_banner_contact(event)
        return Response({"ok": True})
