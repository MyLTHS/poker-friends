"""ASGI config: HTTP goes to Django as usual, WebSocket goes to the room consumers (ADR-001).

Only ever run this behind **one** ASGI process (no multiple Daphne/uvicorn workers): each
process would start its own table actors for the same room. See docs/adr/ADR-001-table-actor.md
mục "Hệ quả".
"""

import os
from urllib.parse import urlparse

import django
from channels.auth import AuthMiddlewareStack
from channels.routing import ProtocolTypeRouter, URLRouter
from channels.security.websocket import AllowedHostsOriginValidator, WebsocketDenier
from django.conf import settings
from django.core.asgi import get_asgi_application

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings")
django.setup()

http_application = get_asgi_application()

from apps.games import actor as table_actors  # noqa: E402  (after django.setup())
from apps.games.routing import websocket_urlpatterns  # noqa: E402


class StartIdleSweep:
    """Start the sweep that closes rooms nobody has sat in for a while (apps/games/actor.py,
    sweep_idle_rooms) in this process's event loop, which runs only once the server serves: on
    the first connection, HTTP or WebSocket. Before that nobody can see a room either, and the
    lobby already leaves out rooms past their time."""

    def __init__(self, app):
        self.app = app

    async def __call__(self, scope, receive, send):
        table_actors.start_idle_sweeper()
        return await self.app(scope, receive, send)


class WildcardOriginMustBeThisHost:
    """A wildcard host (".trycloudflare.com", playing from home) lets in every quick tunnel, an
    attacker's too. For an Origin allowed only by such an entry, the page must come from the very
    host the socket connects to. Exact hosts (localhost, the dev web app on another port) keep the
    usual ALLOWED_HOSTS check below."""

    def __init__(self, app):
        self.app = app

    async def __call__(self, scope, receive, send):
        headers = dict(scope.get("headers", []))
        origin = (urlparse(headers.get(b"origin", b"").decode("latin1")).hostname or "").lower()
        host = headers.get(b"host", b"").decode("latin1").rsplit(":", 1)[0].lower()
        exact = {h.lower() for h in settings.ALLOWED_HOSTS if not h.startswith(".")}
        if origin and origin not in exact and "*" not in exact and origin != host:
            return await WebsocketDenier()(scope, receive, send)
        return await self.app(scope, receive, send)


def websocket_application():
    """AllowedHostsOriginValidator reads ALLOWED_HOSTS once, when built: tests build their own."""
    return WildcardOriginMustBeThisHost(
        AllowedHostsOriginValidator(AuthMiddlewareStack(URLRouter(websocket_urlpatterns)))
    )


application = StartIdleSweep(
    ProtocolTypeRouter(
        {
            "http": http_application,
            # Origin must be one of ALLOWED_HOSTS: another site cannot open a socket with our
            # visitors' cookies. Browsers always send Origin; scripts must set it. Opening the dev
            # app from a LAN address (a phone) needs that address in DJANGO_ALLOWED_HOSTS.
            "websocket": websocket_application(),
        }
    )
)
