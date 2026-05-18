"""
Custom DRF renderers for binary PDF responses.
"""
from __future__ import annotations

from rest_framework.renderers import BaseRenderer, JSONRenderer


class PDFRenderer(BaseRenderer):
    """
    Allows content negotiation when clients send Accept: application/pdf.

    The view returns a Django HttpResponse with PDF bytes; this renderer is only
    used to satisfy negotiation, not to encode the body.
    """

    media_type = "application/pdf"
    format = "pdf"
    charset = None
    render_style = "binary"

    def render(self, data, accepted_media_type=None, renderer_context=None):
        if isinstance(data, (bytes, bytearray)):
            return bytes(data)
        return b""


# JSON for error payloads; PDF for successful report downloads.
REPORT_RENDERER_CLASSES = [PDFRenderer, JSONRenderer]
