"""
PDF export for platform invoices (WeasyPrint).
"""
from __future__ import annotations

from django.http import HttpResponse
from django.utils.html import escape
from weasyprint import HTML

from .models import PlatformInvoice


def render_platform_invoice_pdf(invoice: PlatformInvoice) -> HttpResponse:
    tenant = invoice.tenant
    lines_html = ""
    for item in invoice.line_items or []:
        desc = escape(str(item.get("description", "")))
        amount = escape(str(item.get("amount", invoice.amount)))
        currency = escape(str(item.get("currency", invoice.currency)))
        lines_html += f"<tr><td>{desc}</td><td class=\"num\">{amount} {currency}</td></tr>"

    period = ""
    if invoice.period_start and invoice.period_end:
        period = (
            f"{invoice.period_start.date().isoformat()} — "
            f"{invoice.period_end.date().isoformat()}"
        )

    due = invoice.due_at.date().isoformat() if invoice.due_at else "—"
    issued = invoice.issued_at.date().isoformat() if invoice.issued_at else "—"
    status = escape(invoice.get_payment_status_display())
    kind = escape(invoice.get_kind_display())
    ref = escape(invoice.invoice_reference or "—")

    html = f"""
    <!DOCTYPE html>
    <html><head><meta charset="utf-8">
    <style>
      body {{ font-family: sans-serif; font-size: 11pt; color: #1B263B; }}
      h1 {{ font-size: 18pt; color: #0077B6; margin: 0 0 4px; }}
      .meta {{ color: #666; font-size: 9pt; margin: 0 0 16px; }}
      .grid {{ display: table; width: 100%; margin-bottom: 20px; }}
      .col {{ display: table-cell; width: 50%; vertical-align: top; }}
      .label {{ font-size: 8pt; text-transform: uppercase; color: #888; }}
      table.lines {{ width: 100%; border-collapse: collapse; margin-top: 12px; }}
      table.lines th, table.lines td {{ border: 1px solid #ddd; padding: 8px; }}
      table.lines th {{ background: #f3f4f6; font-size: 9pt; text-transform: uppercase; }}
      td.num {{ text-align: right; white-space: nowrap; }}
      .total {{ font-size: 14pt; font-weight: bold; margin-top: 16px; text-align: right; }}
    </style></head><body>
    <h1>Platform invoice</h1>
    <p class="meta">{escape(invoice.invoice_number)} · {kind} · {status}</p>
    <div class="grid">
      <div class="col">
        <p class="label">Bill to</p>
        <p><strong>{escape(tenant.name)}</strong><br>{escape(tenant.schema_name)}</p>
      </div>
      <div class="col">
        <p class="label">Invoice details</p>
        <p>Issued: {issued}<br>Due: {due}<br>Period: {escape(period or "—")}<br>Ref: {ref}</p>
      </div>
    </div>
    <table class="lines">
      <thead><tr><th>Description</th><th>Amount</th></tr></thead>
      <tbody>{lines_html or f'<tr><td>{kind}</td><td class="num">{invoice.amount} {invoice.currency}</td></tr>'}</tbody>
    </table>
    <p class="total">Total: {invoice.amount} {invoice.currency}</p>
    </body></html>
    """
    pdf = HTML(string=html).write_pdf()
    response = HttpResponse(pdf, content_type="application/pdf")
    response["Content-Disposition"] = (
        f'attachment; filename="{invoice.invoice_number}.pdf"'
    )
    return response
