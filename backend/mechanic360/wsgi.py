"""
WSGI config for Mechanic360.

This is used by traditional WSGI servers (gunicorn, uWSGI, etc.).
"""
from __future__ import annotations

import os

from django.core.wsgi import get_wsgi_application

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "mechanic360.settings")

application = get_wsgi_application()


