"""JSON API for accounts under /api/auth/ (docs/api/openapi.yaml, tag ``auth``).

Session cookie + CSRF like the rest of the API. Unlike DRF's default, CSRF is checked for
logged-out callers too, so another site cannot log a visitor into an account of its choosing.
Errors are ``{"code", "message", "fields"?}`` (ApiError).
"""

from django.conf import settings
from django.contrib.auth import logout
from django.utils.decorators import method_decorator
from django.views.decorators.csrf import ensure_csrf_cookie
from rest_framework import exceptions, status
from rest_framework.authentication import SessionAuthentication
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework.views import APIView, exception_handler

from . import ratelimit, services
from .ratelimit import RateLimited
from .serializers import (
    EmailSerializer,
    GuestSerializer,
    LoginSerializer,
    MeSerializer,
    ResetPasswordSerializer,
    SignupSerializer,
    TokenSerializer,
    UpgradeSerializer,
    check_password,
)
from .services import AccountError

ERROR_STATUS = {
    "validation_error": 400,
    "invalid_credentials": 400,
    "invalid_token": 400,
    "not_authenticated": 401,
    "forbidden": 403,
    "email_not_verified": 403,
    "email_taken": 409,
    "username_taken": 409,
    "not_guest": 409,
    "rate_limited": 429,
}


def error_response(code: str, message: str, fields: dict | None = None) -> Response:
    body = {"code": code, "message": message}
    if fields:
        body["fields"] = fields
    return Response(body, status=ERROR_STATUS[code])


def _field_errors(detail) -> dict[str, list[str]]:
    if not isinstance(detail, dict):
        return {"non_field_errors": [str(item) for item in detail]}
    return {
        field: [str(item) for item in (errors if isinstance(errors, list) else [errors])]
        for field, errors in detail.items()
    }


def api_exception_handler(exc, context):
    if isinstance(exc, AccountError):
        return error_response(exc.code, exc.message, exc.fields)
    if isinstance(exc, RateLimited):
        response = error_response("rate_limited", "Too many requests.")
        response["Retry-After"] = str(exc.retry_after)
        return response
    if isinstance(exc, exceptions.ValidationError):
        return error_response("validation_error", "Invalid body.", _field_errors(exc.detail))
    if isinstance(exc, exceptions.ParseError):
        return error_response("validation_error", str(exc.detail))
    if isinstance(exc, exceptions.NotAuthenticated | exceptions.AuthenticationFailed):
        return error_response("not_authenticated", "Log in first.")
    if isinstance(exc, exceptions.PermissionDenied):
        return error_response("forbidden", str(exc.detail))
    return exception_handler(exc, context)


class CsrfSessionAuthentication(SessionAuthentication):
    def authenticate(self, request):
        self.enforce_csrf(request)
        return super().authenticate(request)


def client_ip(request) -> str:
    # Behind a reverse proxy this is the proxy's address; see docs (B6) before deploying.
    return request.META.get("REMOTE_ADDR", "")


def me(user, http_status=status.HTTP_200_OK) -> Response:
    return Response(MeSerializer(user).data, status=http_status)


class AccountView(APIView):
    authentication_classes = [CsrfSessionAuthentication]
    permission_classes = [AllowAny]

    def get_exception_handler(self):
        return api_exception_handler

    def valid(self, serializer_class, **context) -> dict:
        serializer = serializer_class(data=self.request.data, context=context)
        serializer.is_valid(raise_exception=True)
        return serializer.validated_data


@method_decorator(ensure_csrf_cookie, name="dispatch")
class ConfigView(AccountView):
    """What the login screen needs; also sets the ``csrftoken`` cookie."""

    def get(self, request):
        google = bool(settings.GOOGLE_CLIENT_ID and settings.GOOGLE_CLIENT_SECRET)
        return Response({"google_enabled": google})


class MeView(AccountView):
    def get(self, request):
        if not request.user.is_authenticated:
            raise exceptions.NotAuthenticated()
        return me(request.user)


class SignupView(AccountView):
    def post(self, request):
        data = self.valid(SignupSerializer)
        ratelimit.EMAIL_SENDS_PER_IP.hit(client_ip(request))
        user = services.signup(data["email"], data["username"], data["password"])
        return me(user, status.HTTP_201_CREATED)


class VerifyEmailView(AccountView):
    def post(self, request):
        return me(services.verify_email(self.valid(TokenSerializer)["token"]))


class ResendVerificationView(AccountView):
    def post(self, request):
        email = self.valid(EmailSerializer)["email"]
        ratelimit.EMAIL_SENDS_PER_IP.hit(client_ip(request))
        services.resend_verification(email)
        return Response(status=status.HTTP_202_ACCEPTED)


class LoginView(AccountView):
    def post(self, request):
        data = self.valid(LoginSerializer)
        user = services.login_with_password(
            request, data["email"], data["password"], client_ip(request)
        )
        return me(user)


class LogoutView(AccountView):
    def post(self, request):
        logout(request)
        return Response(status=status.HTTP_204_NO_CONTENT)


class ForgotPasswordView(AccountView):
    def post(self, request):
        email = self.valid(EmailSerializer)["email"]
        services.request_password_reset(email, client_ip(request))
        # Same answer whether or not the email has an account.
        return Response(status=status.HTTP_202_ACCEPTED)


class ResetPasswordView(AccountView):
    def post(self, request):
        data = self.valid(ResetPasswordSerializer)
        user = services.user_for_reset(data["uid"], data["token"])
        check_password(data["password"], user)
        services.reset_password(user, data["password"])
        return Response(status=status.HTTP_204_NO_CONTENT)


class GuestView(AccountView):
    def post(self, request):
        username = self.valid(GuestSerializer).get("username")
        user, created = services.create_guest(request, username, client_ip(request))
        return me(user, status.HTTP_201_CREATED if created else status.HTTP_200_OK)


class UpgradeView(AccountView):
    def post(self, request):
        if not request.user.is_authenticated:
            raise exceptions.NotAuthenticated()
        if not request.user.is_guest:
            raise AccountError("not_guest", "Only a guest account can be upgraded.")
        data = self.valid(UpgradeSerializer, user=request.user)
        ratelimit.EMAIL_SENDS_PER_IP.hit(client_ip(request))
        user = services.upgrade_guest(
            request, data["email"], data["password"], data.get("username")
        )
        return me(user)
