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
