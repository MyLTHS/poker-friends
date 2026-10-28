#!/usr/bin/env python
"""Django's command-line utility for administrative tasks."""

import os
import sys


def main():
    """Run administrative tasks."""
    os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings")
    # Local commands (runserver, migrate, the e2e server) with no DJANGO_SECRET_KEY configured
    # are development: DEBUG on for them. A server with its secret, and Daphne (config/asgi.py)
    # always, keep the safe default from config/settings.py: off.
    if "DJANGO_SECRET_KEY" not in os.environ:
        os.environ.setdefault("DJANGO_DEBUG", "true")
    try:
        from django.core.management import execute_from_command_line
    except ImportError as exc:
        raise ImportError(
            "Couldn't import Django. Are you sure it's installed and "
            "available on your PYTHONPATH environment variable? Did you "
            "forget to activate a virtual environment?"
        ) from exc
    execute_from_command_line(sys.argv)


if __name__ == "__main__":
    main()
