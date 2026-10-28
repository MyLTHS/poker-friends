"""Settings for pytest: the normal settings with DJANGO_DEBUG on, like local development.

pytest-django loads settings before any conftest runs, so the switch has to live here. Tests
never see a production secret; requests inside tests still run with DEBUG off (pytest-django
sets that), as in production.
"""

import os

os.environ.setdefault("DJANGO_DEBUG", "true")

from config.settings import *  # noqa: E402, F403
