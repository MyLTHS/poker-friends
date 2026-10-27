"""Who is playing: the Django-auth user (B6), or a new guest logged in on the spot.

A visitor without a session becomes a guest as soon as they first reach a table (REST or
WebSocket) and is logged in through Django auth, the same way ``POST /api/auth/guest/`` does.
So the guest shows up in ``/api/auth/me/`` and can upgrade later with the same ``User.id``,
keeping seat, chips and hand history. Guests made this way count against the same per-IP limit
as ``POST /api/auth/guest/`` (``ratelimit.RateLimited`` when used up).
"""

from asgiref.sync import sync_to_async
from channels.auth import login as channels_login
from channels.db import database_sync_to_async
from django.contrib.auth import alogin

from apps.accounts import ratelimit
from apps.accounts.services import MODEL_BACKEND, new_guest
from apps.accounts.views import client_ip, client_ip_from

from .models import User


async def player_for_request(request) -> User:
    user = await request.auser()
    if user.is_authenticated:
        return user
    ratelimit.GUESTS_PER_IP.hit(client_ip(request))
    user = await sync_to_async(new_guest)()
    await alogin(request, user, backend=MODEL_BACKEND)
    return user


async def player_for_scope(scope) -> User:
    """Same for a WebSocket. Channels cannot set a cookie on the handshake, so a browser that
    has never made an HTTP request gets a fresh guest per connection; the web app loads the
    snapshot over HTTP first, which sets the cookie."""
    user = scope.get("user")
    if user is not None and user.is_authenticated:
        return user
    ratelimit.GUESTS_PER_IP.hit(scope_ip(scope))
    user = await sync_to_async(new_guest)()
    await channels_login(scope, user, backend=MODEL_BACKEND)
    await database_sync_to_async(scope["session"].save)()
    return user


def scope_ip(scope) -> str:
    headers = dict(scope.get("headers") or [])
    forwarded = headers.get(b"x-forwarded-for", b"").decode("latin-1")
    client = scope.get("client") or ("", 0)
    return client_ip_from(client[0], forwarded)
