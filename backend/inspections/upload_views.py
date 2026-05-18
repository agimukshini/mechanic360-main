"""
Photo upload API for inspections and vehicles.

Provides a simple endpoint to upload photos that can be attached to
inspection checklists or vehicle profiles.
"""
from __future__ import annotations

import os
import uuid

from rest_framework import views
from rest_framework.decorators import api_view, permission_classes
from rest_framework.response import Response
from rest_framework.parsers import MultiPartParser, FormParser

from django.conf import settings
from django.core.files.storage import default_storage

from mechanic360.permissions import IsTenantUser


class PhotoUploadView(views.APIView):
    """
    Upload a photo file.

    Accepts multipart/form-data with a 'file' field.
    Returns the URL/path to the uploaded file.
    """

    permission_classes = [IsTenantUser]
    parser_classes = [MultiPartParser, FormParser]

    def post(self, request):
        if 'file' not in request.FILES:
            return Response(
                {'error': 'No file provided'},
                status=400,
            )

        file = request.FILES['file']

        # Validate file type
        allowed_types = ['image/jpeg', 'image/png', 'image/webp', 'image/gif']
        if file.content_type not in allowed_types:
            return Response(
                {'error': f'Invalid file type. Allowed: {", ".join(allowed_types)}'},
                status=400,
            )

        # Validate file size (max 10MB)
        if file.size > 10 * 1024 * 1024:
            return Response(
                {'error': 'File too large. Max size: 10MB'},
                status=400,
            )

        # Generate unique filename
        ext = file.name.split('.')[-1] if '.' in file.name else 'jpg'
        filename = f"photos/{uuid.uuid4()}.{ext}"

        # Save file
        path = default_storage.save(filename, file)
        url = default_storage.url(path)

        return Response({
            'url': url,
            'filename': file.name,
            'size': file.size,
        })


@api_view(['DELETE'])
@permission_classes([IsTenantUser])
def delete_photo(request, filename):
    """
    Delete a previously uploaded photo.
    """
    safe_name = os.path.basename(str(filename))
    if not safe_name or safe_name in (".", "..") or safe_name != filename:
        return Response({"detail": "Invalid filename"}, status=400)

    filepath = f"photos/{safe_name}"
    if default_storage.exists(filepath):
        default_storage.delete(filepath)
        return Response({'message': 'Photo deleted'})
    return Response({'error': 'Photo not found'}, status=404)
