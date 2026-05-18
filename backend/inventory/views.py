"""
API viewsets for inventory management.

Tenants have full rights over their own inventory.
Because we use schema-based multi-tenancy, each request is already scoped to
the current tenant's PostgreSQL schema; we simply require authentication here.
"""
from __future__ import annotations

from decimal import Decimal, InvalidOperation

from rest_framework import viewsets, filters
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.parsers import JSONParser, MultiPartParser, FormParser

from mechanic360.mixins import DestroyRequiresAdvisorMixin
from mechanic360.permissions import IsAdvisorOrAdmin, IsTenantUser

from .models import InventoryItem
from .serializers import InventoryItemSerializer


class InventoryItemViewSet(DestroyRequiresAdvisorMixin, viewsets.ModelViewSet):
    """
    Full CRUD over inventory items for the current tenant.

    Tenants can:
    - register new inventory items (parts, materials)
    - update stock levels and pricing
    - delete items if needed
    """

    queryset = InventoryItem.objects.all()
    serializer_class = InventoryItemSerializer
    permission_classes = [IsTenantUser]
    parser_classes = [JSONParser, MultiPartParser, FormParser]

    filter_backends = [filters.SearchFilter, filters.OrderingFilter]
    search_fields = ["sku", "name", "manufacturer", "supplier"]
    ordering_fields = ["name", "sku", "current_stock", "created_at"]
    ordering = ["name"]

    @action(
        detail=False,
        methods=["post"],
        url_path="bulk_upload",
        parser_classes=[MultiPartParser, FormParser],
        permission_classes=[IsAdvisorOrAdmin],
    )
    def bulk_upload(self, request):
        """
        Bulk upload inventory items from an XLSX file.

        Expected columns (header row required):
        - sku (required)
        - name (required)
        - manufacturer (optional)
        - supplier (optional)
        - purchase_cost (optional, default 0)
        - sale_price (optional, default 0)
        - current_stock (optional, default 0)
        - minimum_stock (optional, default 0)

        Returns a summary of created/updated/skipped items.
        """
        import openpyxl
        from io import BytesIO

        if "file" not in request.FILES:
            return Response(
                {"error": "No file provided. Upload an XLSX file."},
                status=400,
            )

        uploaded_file = request.FILES["file"]
        if not uploaded_file.name.endswith(".xlsx"):
            return Response(
                {"error": "Only .xlsx files are supported."},
                status=400,
            )

        try:
            workbook = openpyxl.load_workbook(BytesIO(uploaded_file.read()))
            sheet = workbook.active
            rows = list(sheet.iter_rows(values_only=True))
        except Exception as e:
            return Response(
                {"error": f"Failed to read file: {str(e)}"},
                status=400,
            )

        if not rows:
            return Response({"error": "File is empty."}, status=400)

        # Parse header row
        headers = [str(h).strip().lower() if h else "" for h in rows[0]]

        # Map headers to expected fields
        expected_fields = {
            "sku": "sku",
            "name": "name",
            "manufacturer": "manufacturer",
            "supplier": "supplier",
            "purchase_cost": "purchase_cost",
            "sale_price": "sale_price",
            "current_stock": "current_stock",
            "minimum_stock": "minimum_stock",
        }

        col_indices = {}
        for expected_key in expected_fields:
            try:
                col_indices[expected_key] = headers.index(expected_key)
            except ValueError:
                # Column not found - will use defaults for optional fields
                if expected_key in ("sku", "name"):
                    return Response(
                        {"error": f"Required column '{expected_key}' not found in header."},
                        status=400,
                    )

        created = 0
        updated = 0
        skipped = 0
        errors = []

        for row_num, row in enumerate(rows[1:], start=2):
            try:
                # Extract values by column index
                def get_val(field):
                    idx = col_indices.get(field)
                    if idx is None or idx >= len(row):
                        return None
                    val = row[idx]
                    if val is None or (isinstance(val, str) and val.strip() == ""):
                        return None
                    return val

                sku = str(get_val("sku")).strip()
                name = str(get_val("name")).strip()

                if not sku or not name:
                    skipped += 1
                    errors.append(f"Row {row_num}: Missing SKU or name, skipped.")
                    continue

                # Parse numeric fields with defaults
                def parse_decimal(val, default=Decimal("0")):
                    if val is None:
                        return default
                    try:
                        return Decimal(str(val))
                    except (InvalidOperation, ValueError):
                        return default

                def parse_int(val, default=0):
                    if val is None:
                        return default
                    try:
                        return int(float(str(val)))
                    except (ValueError, TypeError):
                        return default

                purchase_cost = parse_decimal(get_val("purchase_cost"))
                sale_price = parse_decimal(get_val("sale_price"))
                current_stock = parse_int(get_val("current_stock"))
                minimum_stock = parse_int(get_val("minimum_stock"))
                manufacturer = get_val("manufacturer")
                supplier = get_val("supplier")

                # Upsert: create or update by SKU
                obj, is_created = InventoryItem.objects.update_or_create(
                    sku=sku,
                    defaults={
                        "name": name,
                        "manufacturer": str(manufacturer) if manufacturer else "",
                        "supplier": str(supplier) if supplier else "",
                        "purchase_cost": purchase_cost,
                        "sale_price": sale_price,
                        "current_stock": current_stock,
                        "minimum_stock": minimum_stock,
                    },
                )

                if is_created:
                    created += 1
                else:
                    updated += 1

            except Exception as e:
                skipped += 1
                errors.append(f"Row {row_num}: {str(e)}")

        result = {
            "created": created,
            "updated": updated,
            "skipped": skipped,
            "total_processed": len(rows) - 1,
        }
        if errors:
            result["errors"] = errors[:20]  # Limit error messages

        return Response(result)
