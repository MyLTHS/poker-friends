"""The address the player is using, for links in emails (FRONTEND_URL_FROM_REQUEST).

Playing from home (docs/choi-online.md), every start of the tunnel gives a new
https://<words>.trycloudflare.com address, so a fixed FRONTEND_URL would send verification and
password reset links to an address that no longer exists. With the setting on, ``web_link`` uses
the address of the request that triggered the email instead. The host was already checked
against ALLOWED_HOSTS before any view runs.
"""

from contextvars import ContextVar

from asgiref.sync import iscoroutinefunction
from django.utils.decorators import sync_and_async_middleware

request_origin: ContextVar[str | None] = ContextVar("request_origin", default=None)


@sync_and_async_middleware
def remember_origin(get_response):
    if iscoroutinefunction(get_response):

        async def middleware(request):
            token = request_origin.set(f"{request.scheme}://{request.get_host()}")
            try:
                return await get_response(request)
            finally:
                request_origin.reset(token)

    else:

        def middleware(request):
            token = request_origin.set(f"{request.scheme}://{request.get_host()}")
            try:
                return get_response(request)
            finally:
                request_origin.reset(token)

    return middleware


# --- Members only (GUESTS_ALLOWED off) -------------------------------------------------------

# Open to everyone: signing up, logging in, verifying, resetting a password, and browser error
# reports (a page can fail before anyone logs in). Everything else under /api/ needs a member.
OPEN_API_PREFIXES = ("/api/auth/", "/api/client-errors/")


def is_member(user) -> bool:
    """Staff, or a real account the owner approved, with its email verified. Approval is its own
    flag: with Gmail or Google sign-in on, a stranger can verify their own email."""
    from apps.accounts.services import is_email_verified

    if not user.is_authenticated or not user.is_active:
        return False
    if user.is_staff:
        return True
    return not user.is_guest and user.approved and is_email_verified(user)


def _needs_member(request) -> bool:
    from django.conf import settings

    path = request.path
    return (
        not settings.GUESTS_ALLOWED
        and path.startswith("/api/")
        and not path.startswith(OPEN_API_PREFIXES)
    )


def _login_required():
    from django.http import JsonResponse

    body = {"code": "login_required", "message": "Log in with a verified account first."}
    return JsonResponse(body, status=401)


@sync_and_async_middleware
def members_only(get_response):
    """With GUESTS_ALLOWED off (playing from home, production) nobody without a verified account
    reaches the rooms: no guest is made on the fly, and old guest sessions are refused too. The
    WebSocket does the same check in RoomConsumer.connect."""
    from asgiref.sync import sync_to_async

    if iscoroutinefunction(get_response):

        async def middleware(request):
            if _needs_member(request) and not await sync_to_async(is_member)(await request.auser()):
                return _login_required()
            return await get_response(request)

    else:

        def middleware(request):
            if _needs_member(request) and not is_member(request.user):
                return _login_required()
            return get_response(request)

    return middleware
