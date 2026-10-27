import logging
from functools import wraps

from allauth.socialaccount.providers.google.views import oauth2_callback, oauth2_login
from django.db import transaction
from django.http import HttpResponseRedirect
from django.urls import NoReverseMatch, include, path

from . import views
from .adapters import error_redirect, google_enabled, web_result

logger = logging.getLogger(__name__)
GOOGLE_PROCESSES = {"login", "connect"}


def google_view(view, *, start: bool = False):
    """Run one allauth Google view, always ending in the web app, never in an allauth page.

    - Without Google keys, go back with ``?error=google_disabled`` instead of a 500.
    - The start view only takes the web app's form POST with ``process`` login or connect;
      a plain GET would render allauth's HTML confirmation page.
    - The view runs in one transaction, so a refused guest upgrade also drops the Google link
      allauth saved (signals.py).
    - allauth redirects to its own pages (signup form, "inactive") in cases our adapters should
      have caught; those URLs are not mounted, so turn the error into ``google_failed``.
    """

    @wraps(view)
    def wrapper(request, *args, **kwargs):
        if not google_enabled():
            return error_redirect("google_disabled")
        if start:
            if request.method != "POST":
                return HttpResponseRedirect(web_result())
            if request.POST.get("process", "login") not in GOOGLE_PROCESSES:
                return error_redirect("google_failed")
        try:
            with transaction.atomic():
                return view(request, *args, **kwargs)
        except NoReverseMatch:
            logger.exception("allauth tried to show a page that is not mounted")
            return error_redirect("google_failed")

    return wrapper


api = [
    path("config/", views.ConfigView.as_view()),
    path("me/", views.MeView.as_view()),
    path("signup/", views.SignupView.as_view()),
    path("verify-email/", views.VerifyEmailView.as_view()),
    path("verify-email/resend/", views.ResendVerificationView.as_view()),
    path("login/", views.LoginView.as_view()),
    path("logout/", views.LogoutView.as_view()),
    path("password/forgot/", views.ForgotPasswordView.as_view()),
    path("password/reset/", views.ResetPasswordView.as_view()),
    path("guest/", views.GuestView.as_view()),
    path("upgrade/", views.UpgradeView.as_view()),
]

urlpatterns = [
    path("api/auth/", include(api)),
    # Only the two allauth views the Google flow needs; allauth's HTML pages stay off.
    path("accounts/google/login/", google_view(oauth2_login, start=True), name="google_login"),
    path("accounts/google/login/callback/", google_view(oauth2_callback), name="google_callback"),
]
