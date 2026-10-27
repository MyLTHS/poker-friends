"""ASGI config: HTTP goes to Django as usual, WebSocket goes to the room consumers (ADR-001).

Only ever run this behind **one** ASGI process (no multiple Daphne/uvicorn workers): each
process would start its own table actors for the same room. See docs/adr/ADR-001-table-actor.md
mục "Hệ quả".
"""

import os

import django
from channels.auth import AuthMiddlewareStack
from channels.routing import ProtocolTypeRouter, URLRouter
from channels.security.websocket import AllowedHostsOriginValidator
from django.core.asgi import get_asgi_application

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings")
django.setup()

http_application = get_asgi_application()

from apps.games.routing import websocket_urlpatterns  # noqa: E402  (after django.setup())

application = ProtocolTypeRouter(
    {
        "http": http_application,
        # Origin must be one of ALLOWED_HOSTS: another site cannot open a socket with our
        # visitors' cookies. Browsers always send Origin; scripts must set it. Opening the dev
        # app from a LAN address (a phone) needs that address in DJANGO_ALLOWED_HOSTS.
        "websocket": AllowedHostsOriginValidator(
            AuthMiddlewareStack(URLRouter(websocket_urlpatterns))
        ),
    }
)
