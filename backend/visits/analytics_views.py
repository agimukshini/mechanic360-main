"""
API views for analytics and reporting.

Provides aggregated data for the analytics dashboard including:
- Visit statistics by period
- Revenue breakdown
- Parts consumption
- Preventive maintenance forecasting
"""
from __future__ import annotations

from datetime import timedelta

from django.db.models import Count, Sum, Q, F
from django.utils import timezone
from rest_framework import views
from rest_framework.decorators import api_view, permission_classes
from rest_framework.response import Response

from vehicles.models import ServiceVisit, Vehicle
from visits.models import VisitServiceLine, VisitMaterialLine, VisitLaborLine, PreventiveMaintenancePlan
from inventory.models import InventoryItem

from mechanic360.permissions import IsAdvisorOrAdmin, IsTenantUser

from .mechanic_analytics import mechanic_detail, mechanics_summary


@api_view(['GET'])
@permission_classes([IsAdvisorOrAdmin])
def dashboard_stats(request):
    """
    Get high-level dashboard statistics.
    """
    total_clients = 0  # Will be calculated from vehicles
    total_vehicles = Vehicle.objects.count()
    total_visits = ServiceVisit.objects.count()
    low_stock_items = InventoryItem.objects.filter(
        current_stock__lte=F('minimum_stock')
    ).count()

    # Recent visits (last 7 days)
    recent_visits = ServiceVisit.objects.filter(
        service_date__gte=timezone.now() - timedelta(days=7)
    ).count()

    # Visits by status
    visits_by_status = ServiceVisit.objects.values('status').annotate(
        count=Count('id')
    )

    return Response({
        'total_vehicles': total_vehicles,
        'total_visits': total_visits,
        'low_stock_items': low_stock_items,
        'recent_visits': recent_visits,
        'visits_by_status': {item['status']: item['count'] for item in visits_by_status},
    })


@api_view(['GET'])
@permission_classes([IsAdvisorOrAdmin])
def visits_overview(request):
    """
    Get visits data grouped by period (day, week, month).
    """
    period = request.query_params.get('period', 'month')  # day, week, month

    now = timezone.now()
    if period == 'day':
        start_date = now - timedelta(days=7)
    elif period == 'week':
        start_date = now - timedelta(weeks=8)
    else:  # month
        start_date = now - timedelta(days=365)

    visits = ServiceVisit.objects.filter(
        service_date__gte=start_date
    ).order_by('service_date')

    # Group by period
    data = {}
    for visit in visits:
        if period == 'day':
            key = visit.service_date.strftime('%Y-%m-%d')
        elif period == 'week':
            key = visit.service_date.strftime('%Y-W%W')
        else:
            key = visit.service_date.strftime('%Y-%m')

        if key not in data:
            data[key] = {'date': key, 'count': 0, 'completed': 0, 'revenue': 0}

        data[key]['count'] += 1
        if visit.status == 'completed':
            data[key]['completed'] += 1

        # Calculate revenue from line items
        service_total = VisitServiceLine.objects.filter(visit=visit).aggregate(
            total=Sum('total_price')
        )['total'] or 0
        labor_total = VisitLaborLine.objects.filter(visit=visit).aggregate(
            total=Sum('total_price')
        )['total'] or 0
        material_total = VisitMaterialLine.objects.filter(visit=visit).aggregate(
            total=Sum('total_price')
        )['total'] or 0

        data[key]['revenue'] += float(service_total) + float(labor_total) + float(material_total)

    # Convert to list and sort
    result = sorted(data.values(), key=lambda x: x['date'])

    return Response(result)


@api_view(['GET'])
@permission_classes([IsAdvisorOrAdmin])
def revenue_breakdown(request):
    """
    Get revenue breakdown by service type.
    """
    services = VisitServiceLine.objects.values(
        'description'
    ).annotate(
        total=Sum('total_price'),
        count=Count('id')
    ).order_by('-total')

    return Response({
        'services': list(services),
        'total_revenue': sum(float(s['total']) for s in services),
    })


@api_view(['GET'])
@permission_classes([IsAdvisorOrAdmin])
def parts_consumption(request):
    """
    Get parts consumption statistics.
    """
    parts = VisitMaterialLine.objects.select_related('inventory_item').values(
        'inventory_item__name',
        'inventory_item__sku'
    ).annotate(
        total_used=Sum('quantity'),
        total_revenue=Sum('total_price'),
        times_used=Count('id')
    ).order_by('-total_used')

    return Response(list(parts))


@api_view(['GET'])
@permission_classes([IsAdvisorOrAdmin])
def maintenance_forecast(request):
    """
    Get preventive maintenance forecast - vehicles due for service.
    """
    plans = PreventiveMaintenancePlan.objects.filter(
        is_active=True
    ).select_related('vehicle', 'vehicle__owner')

    forecast = []
    for plan in plans:
        # Calculate next due based on intervals
        next_due = None
        due_type = None

        if plan.interval_km and plan.last_mileage_km:
            next_mileage = plan.last_mileage_km + plan.interval_km
            current_mileage = plan.vehicle.odometer_km
            if current_mileage >= next_mileage:
                next_due = "Overdue"
                due_type = "km"
            else:
                km_remaining = next_mileage - current_mileage
                next_due = f"In {km_remaining} km"
                due_type = "km"

        elif plan.interval_days and plan.last_service_date:
            from datetime import date
            last_date = plan.last_service_date
            days_since = (date.today() - last_date).days
            if days_since >= plan.interval_days:
                next_due = "Overdue"
                due_type = "days"
            else:
                days_remaining = plan.interval_days - days_since
                next_due = f"In {days_remaining} days"
                due_type = "days"

        forecast.append({
            'plan_id': str(plan.id),
            'plan_name': plan.name,
            'vehicle': f"{plan.vehicle.license_plate} - {plan.vehicle.make} {plan.vehicle.model}",
            'owner': plan.vehicle.owner.name or plan.vehicle.owner.company_name,
            'next_due': next_due or "Not scheduled",
            'due_type': due_type,
        })

    # Sort: overdue first, then by due date
    forecast.sort(key=lambda x: (0 if 'Overdue' in x['next_due'] else 1, x['next_due']))

    return Response(forecast)


@api_view(["GET"])
@permission_classes([IsTenantUser])
def mechanics_analytics_summary(request):
    return mechanics_summary(request)


@api_view(["GET"])
@permission_classes([IsTenantUser])
def mechanics_analytics_detail(request, user_id: str):
    return mechanic_detail(request, user_id)
