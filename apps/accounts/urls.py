from functools import wraps

from allauth.socialaccount.providers.google.views import oauth2_callback, oauth2_login
from django.http import HttpResponseRedirect
from django.urls import include, path

from . import views
from .adapters import google_enabled, web_result


def google_only(view):
    """Without Google keys, send the browser back to the web app instead of a 500 page."""

    @wraps(view)
    def wrapper(request, *args, **kwargs):
        if not google_enabled():
            return HttpResponseRedirect(web_result(error="google_disabled"))
        return view(request, *args, **kwargs)

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
    path("accounts/google/login/", google_only(oauth2_login), name="google_login"),
    path("accounts/google/login/callback/", google_only(oauth2_callback), name="google_callback"),
]
