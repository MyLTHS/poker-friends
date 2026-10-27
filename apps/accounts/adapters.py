"""django-allauth hooks. allauth only runs the Google OAuth flow here.

The browser always ends up back in the web app at ``/account?google=ok`` or
``/account?error=<code>``; the codes are the ApiError codes of docs/api/openapi.yaml.
Google is never used to merge accounts: an email that already belongs to another account is
refused, and only a guest can connect Google (that is the guest upgrade).
"""

from allauth.account.adapter import DefaultAccountAdapter
from allauth.core.exceptions import ImmediateHttpResponse
from allauth.socialaccount.adapter import DefaultSocialAccountAdapter
from allauth.socialaccount.providers.base import AuthProcess
from django.conf import settings
from django.http import HttpResponseRedirect

from .services import email_in_use, normalize_email, web_link


def google_enabled() -> bool:
    return bool(settings.GOOGLE_CLIENT_ID and settings.GOOGLE_CLIENT_SECRET)


def web_result(**params: str) -> str:
    return web_link("/account", **params)


def abort(code: str):
    raise ImmediateHttpResponse(HttpResponseRedirect(web_result(error=code)))


class AccountAdapter(DefaultAccountAdapter):
    def get_login_redirect_url(self, request) -> str:
        return web_result(google="ok")

    def get_signup_redirect_url(self, request) -> str:
        return web_result(google="ok")

    def is_safe_url(self, url: str) -> bool:
        return url.startswith(settings.FRONTEND_URL + "/") or super().is_safe_url(url)


class SocialAccountAdapter(DefaultSocialAccountAdapter):
    def pre_social_login(self, request, sociallogin) -> None:
        email = normalize_email(sociallogin.user.email or "")
        if sociallogin.state.get("process") == AuthProcess.CONNECT:
            user = request.user
            if not user.is_authenticated or not user.is_guest:
                abort("not_guest")
            if sociallogin.is_existing:
                abort("social_account_taken")
            if not email or email_in_use(email, exclude=user):
                abort("email_taken")
        elif not sociallogin.is_existing:
            if not email:
                abort("google_failed")
            if email_in_use(email):
                abort("email_taken")

    def populate_user(self, request, sociallogin, data):
        user = super().populate_user(request, sociallogin, data)
        user.email = normalize_email(user.email or "")
        return user

    def get_connect_redirect_url(self, request, socialaccount) -> str:
        return web_result(google="ok")

    def on_authentication_error(self, request, provider, error=None, exception=None, **kw):
        abort("google_failed")
