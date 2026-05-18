#!/usr/bin/env python
"""
Entry point for Django's management commands.

This file is intentionally minimal and follows the standard Django layout so
that `python manage.py runserver` and other commands work as expected.
"""
import os
import sys


def main() -> None:
    """Run administrative tasks."""
    # Point Django at our settings module
    os.environ.setdefault("DJANGO_SETTINGS_MODULE", "mechanic360.settings")
    try:
        from django.core.management import execute_from_command_line
    except ImportError as exc:
        # Helpful error if Django isn't installed in the current environment
        raise ImportError(
            "Couldn't import Django. Are you sure it's installed and "
            "available on your PYTHONPATH environment variable? Did you "
            "forget to activate a virtual environment?"
        ) from exc
    # Delegate to Django's CLI handler
    execute_from_command_line(sys.argv)


if __name__ == "__main__":
    main()


