"""django-allauth hooks. allauth only runs the Google OAuth flow here.

The browser always ends up back in the web app at ``/account?google=ok`` or
``/account?error=<code>``, with the codes in ``GOOGLE_ERRORS`` (``GoogleError`` in
docs/api/openapi.yaml). Google is never used to merge accounts: an email that already belongs
to another account is refused, and only a guest can connect Google (that is the guest upgrade).
Only an address Google itself marks as verified is accepted; otherwise anyone could create an
account under a friend's email before the friend signs up.
"""

from allauth.account.adapter import DefaultAccountAdapter
from allauth.core.exceptions import ImmediateHttpResponse
from allauth.socialaccount.adapter import DefaultSocialAccountAdapter
from allauth.socialaccount.providers.base import AuthProcess
from django.conf import settings
from django.http import HttpResponseRedirect

from .services import email_in_use, lock_email, normalize_email, web_link

GOOGLE_ERRORS = (
    "google_disabled",
    "google_failed",
    "email_taken",
    "email_not_verified",
    "social_account_taken",
    "not_guest",
    "account_inactive",
)


def google_enabled() -> bool:
    return bool(settings.GOOGLE_CLIENT_ID and settings.GOOGLE_CLIENT_SECRET)


def web_result(**params: str) -> str:
    return web_link("/account", **params)


def error_redirect(code: str) -> HttpResponseRedirect:
    assert code in GOOGLE_ERRORS, code
    return HttpResponseRedirect(web_result(error=code))


def abort(code: str):
    raise ImmediateHttpResponse(error_redirect(code))


def google_verified_email(sociallogin) -> str:
    """The address Google vouches for (its ``email_verified`` flag), or ""."""
    for address in sociallogin.email_addresses:
        if address.verified and address.email:
            return normalize_email(address.email)
    return ""


class AccountAdapter(DefaultAccountAdapter):
    def get_login_redirect_url(self, request) -> str:
        return web_result(google="ok")

    def get_signup_redirect_url(self, request) -> str:
        return web_result(google="ok")

    def is_safe_url(self, url: str) -> bool:
        return url.startswith(settings.FRONTEND_URL + "/") or super().is_safe_url(url)

    def respond_user_inactive(self, request, user):
        return error_redirect("account_inactive")


class SocialAccountAdapter(DefaultSocialAccountAdapter):
    def pre_social_login(self, request, sociallogin) -> None:
        connect = sociallogin.state.get("process") == AuthProcess.CONNECT
        if connect:
            user = request.user
            if not user.is_authenticated or not user.is_guest:
                abort("not_guest")
            if sociallogin.is_existing:
                abort("social_account_taken")
        elif sociallogin.is_existing:
            return  # a returning Google user: log them in
        email = google_verified_email(sociallogin)
        if not email:
            abort("email_not_verified")
        # The callback runs in one transaction (urls.py), so the lock lasts until the new
        # account or the connected guest is saved.
        lock_email(email)
        if email_in_use(email, exclude=request.user if connect else None):
            abort("email_taken")

    def populate_user(self, request, sociallogin, data):
        user = super().populate_user(request, sociallogin, data)
        user.email = normalize_email(user.email or "")
        return user

    def get_connect_redirect_url(self, request, socialaccount) -> str:
        return web_result(google="ok")

    def on_authentication_error(self, request, provider, error=None, exception=None, **kw):
        abort("google_failed")
