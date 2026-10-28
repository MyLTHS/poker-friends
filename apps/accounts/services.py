"""Account rules: sign-up, email verification, login, password reset, guests and upgrades.

Views only parse input and turn ``AccountError`` into JSON. Whether an email is verified is kept
in allauth's ``EmailAddress`` table, the same place the Google flow writes to, so there is no
extra column on ``User`` (which lives in ``apps.games``).
"""

import logging
import secrets
from urllib.parse import urlencode

from allauth.account.models import EmailAddress
from django.conf import settings
from django.contrib.auth import login, update_session_auth_hash
from django.contrib.auth.hashers import make_password
from django.contrib.auth.tokens import default_token_generator
from django.core import signing
from django.core.mail import send_mail
from django.db import IntegrityError, connection, transaction
from django.template.loader import render_to_string
from django.utils.crypto import constant_time_compare, salted_hmac
from django.utils.encoding import force_bytes, force_str
from django.utils.http import urlsafe_base64_decode, urlsafe_base64_encode

from apps.games.models import User

from . import ratelimit
from .middleware import request_origin

MODEL_BACKEND = "django.contrib.auth.backends.ModelBackend"
VERIFY_SALT = "accounts.verify-email"
INVITE_SALT = "accounts.invite-player"
INVITE_MAX_AGE = 7 * 24 * 60 * 60
DEFAULT_VERIFICATION_MAX_AGE = 3 * 24 * 60 * 60
GUEST_PREFIX = "khach-"

logger = logging.getLogger(__name__)


class AccountError(Exception):
    """A refused request, with a stable ``code`` from docs/api/openapi.yaml (ApiError)."""

    def __init__(self, code: str, message: str = "", fields: dict | None = None):
        super().__init__(message or code)
        self.code = code
        self.message = message or code
        self.fields = fields


def normalize_email(email: str) -> str:
    return email.strip().lower()


def email_in_use(email: str, exclude: User | None = None) -> bool:
    users = User.objects.filter(email__iexact=email)
    addresses = EmailAddress.objects.filter(email__iexact=email)
    if exclude is not None:
        users = users.exclude(pk=exclude.pk)
        addresses = addresses.exclude(user=exclude)
    return users.exists() or addresses.exists()


def username_in_use(username: str, exclude: User | None = None) -> bool:
    users = User.objects.filter(username__iexact=username)
    if exclude is not None:
        users = users.exclude(pk=exclude.pk)
    return users.exists()


def lock_email(email: str) -> None:
    """Hold off other transactions checking the same address until this one ends.

    ``User.email`` has no unique constraint (the model lives in ``apps.games``), so "check it is
    free, then save" must not interleave. PostgreSQL only; SQLite already runs one writer at a
    time. Call inside ``transaction.atomic()``.
    """
    if connection.vendor == "postgresql":
        with connection.cursor() as cursor:
            cursor.execute("SELECT pg_advisory_xact_lock(hashtext(%s))", [f"email:{email}"])


def is_email_verified(user: User) -> bool:
    if not user.email:
        return False
    return EmailAddress.objects.filter(user=user, email__iexact=user.email, verified=True).exists()


def mark_email_verified(user: User) -> None:
    EmailAddress.objects.filter(user=user).exclude(email__iexact=user.email).update(primary=False)
    EmailAddress.objects.update_or_create(
        user=user, email=user.email, defaults={"verified": True, "primary": True}
    )


def _set_primary_email(user: User, email: str) -> None:
    """Record ``email`` as the user's (not yet verified) address."""
    EmailAddress.objects.filter(user=user).update(primary=False)
    EmailAddress.objects.update_or_create(
        user=user, email=email, defaults={"verified": False, "primary": True}
    )


def _check_unique(email: str, username: str | None, exclude: User | None = None) -> None:
    if email_in_use(email, exclude=exclude):
        raise AccountError("email_taken", "This email belongs to another account.")
    if username and username_in_use(username, exclude=exclude):
        raise AccountError("username_taken", "This name is already used.")


def web_link(path: str, **params: str) -> str:
    query = f"?{urlencode(params)}" if params else ""
    base = settings.FRONTEND_URL
    if settings.FRONTEND_URL_FROM_REQUEST:
        base = request_origin.get() or base
    return f"{base}{path}{query}"


def _send(user: User, subject: str, template: str, link: str, max_age: int) -> None:
    body = render_to_string(
        f"accounts/email/{template}.txt",
        {"user": user, "link": link, "hours": max(1, max_age // 3600)},
    )
    try:
        send_mail(subject, body, None, [user.email])
    except Exception:
        # The account change already happened and the person can ask for the link again;
        # failing the request would only hide that. Never log the link: it holds a token.
        logger.exception("Could not send the %s email to user %s", template, user.pk)


# --- Email verification -----------------------------------------------------------------


def _verification_max_age() -> int:
    return getattr(settings, "ACCOUNTS_EMAIL_VERIFICATION_MAX_AGE", DEFAULT_VERIFICATION_MAX_AGE)


def send_verification_email(user: User) -> None:
    # The address is inside the token, so a link stops working once the email changes.
    token = signing.dumps({"u": user.pk, "e": user.email.lower()}, salt=VERIFY_SALT)
    link = web_link("/account/verify", token=token)
    _send(user, "Xác minh email Poker Friends", "verify", link, _verification_max_age())


def verify_email(token: str) -> User:
    try:
        data = signing.loads(token, salt=VERIFY_SALT, max_age=_verification_max_age())
    except signing.BadSignature as error:  # includes SignatureExpired
        raise AccountError("invalid_token", "Bad or expired link.") from error
    user = User.objects.filter(pk=data.get("u"), is_active=True).first()
    if user is None or user.email.lower() != data.get("e"):
        raise AccountError("invalid_token", "The link is for another email address.")
    mark_email_verified(user)
    return user


def resend_verification(email: str) -> None:
    """Send a new link if ``email`` has an unverified account; say nothing either way."""
    user = User.objects.filter(email__iexact=email, is_guest=False, is_active=True).first()
    if user is not None and not is_email_verified(user):
        send_verification_email(user)


# --- Sign-up and login ------------------------------------------------------------------


def signup(email: str, username: str, password: str) -> User:
    email = normalize_email(email)
    try:
        with transaction.atomic():
            lock_email(email)
            _check_unique(email, username)
            user = User.objects.create_user(username=username, email=email, password=password)
            _set_primary_email(user, email)
    except IntegrityError as error:  # lost a race on the unique username
        raise AccountError("username_taken", "This name is already used.") from error
    send_verification_email(user)
    return user


def create_player(email: str, username: str) -> User:
    """A player's account made by staff (Django admin), and its invitation email.

    No password yet: the player sets their own from the invitation link (``invite_player``).
    Staff vouch for the address and let the player in, so it is verified and approved from the
    start.
    """
    email = normalize_email(email)
    try:
        with transaction.atomic():
            lock_email(email)
            _check_unique(email, username)
            # Staff made it, so the owner has let this player in (approved) from the start.
            user = User.objects.create_user(
                username=username, email=email, password=None, approved=True
            )
            mark_email_verified(user)
    except IntegrityError as error:  # lost a race on the unique username
        raise AccountError("username_taken", "This name is already used.") from error
    invite_player(user)
    return user


def _invite_state(user: User) -> str:
    # Changes once the player sets a password or logs in, so a link works once.
    state = f"{user.pk}|{user.password}|{user.last_login}"
    return salted_hmac(INVITE_SALT, state, algorithm="sha256").hexdigest()[:20]


def invitation_link(user: User) -> str:
    """The web's "set a password" page for ``user``, valid for INVITE_MAX_AGE (several days,
    unlike a reset link) and once. ``moi=1`` makes the page greet a new player."""
    token = signing.dumps({"u": user.pk, "s": _invite_state(user)}, salt=INVITE_SALT)
    return web_link(
        "/account/reset", uid=urlsafe_base64_encode(force_bytes(user.pk)), token=token, moi="1"
    )


def invite_player(user: User) -> str:
    """Email ``user`` a fresh invitation; return its link (staff may also send it by chat)."""
    link = invitation_link(user)
    _send(user, "Lời mời vào Poker Friends", "invite", link, INVITE_MAX_AGE)
    return link


def _is_invitation(user: User, token: str) -> bool:
    try:
        data = signing.loads(token, salt=INVITE_SALT, max_age=INVITE_MAX_AGE)
    except signing.BadSignature:  # includes SignatureExpired
        return False
    return data.get("u") == user.pk and constant_time_compare(
        data.get("s", ""), _invite_state(user)
    )


def _email_and_ip(email: str, ip: str) -> str:
    return f"{email}|{ip}"


def login_with_password(request, email: str, password: str, ip: str) -> User:
    email = normalize_email(email)
    ratelimit.LOGIN_ATTEMPTS_PER_IP.hit(ip)
    ratelimit.LOGIN_FAILURES_PER_EMAIL_AND_IP.check(_email_and_ip(email, ip))
    ratelimit.LOGIN_FAILURES_PER_EMAIL.check(email)

    user = User.objects.filter(email__iexact=email, is_guest=False).order_by("pk").first()
    if user is None:
        make_password(password)  # same work as a real check, so timing does not leak emails
    if user is None or not user.check_password(password) or not user.is_active:
        ratelimit.LOGIN_FAILURES_PER_EMAIL_AND_IP.hit(_email_and_ip(email, ip))
        ratelimit.LOGIN_FAILURES_PER_EMAIL.hit(email)
        raise AccountError("invalid_credentials", "Wrong email or password.")
    if not is_email_verified(user):
        raise AccountError("email_not_verified", "Verify the email address first.")
    if not settings.GUESTS_ALLOWED and not (user.approved or user.is_staff):
        raise AccountError("not_approved", "The owner has not let this account in yet.")

    ratelimit.LOGIN_FAILURES_PER_EMAIL_AND_IP.reset(_email_and_ip(email, ip))
    login(request, user, backend=MODEL_BACKEND)
    return user


# --- Password reset ---------------------------------------------------------------------


def request_password_reset(email: str, ip: str) -> None:
    email = normalize_email(email)
    ratelimit.PASSWORD_RESET_PER_IP.hit(ip)
    ratelimit.PASSWORD_RESET_PER_EMAIL.hit(email)
    user = (
        User.objects.filter(email__iexact=email, is_guest=False, is_active=True)
        .order_by("pk")
        .first()
    )
    if user is None:
        return
    link = web_link(
        "/account/reset",
        uid=urlsafe_base64_encode(force_bytes(user.pk)),
        token=default_token_generator.make_token(user),
    )
    _send(user, "Đặt lại mật khẩu Poker Friends", "reset", link, settings.PASSWORD_RESET_TIMEOUT)


def user_for_reset(uid: str, token: str) -> User:
    try:
        pk = force_str(urlsafe_base64_decode(uid))
        user = User.objects.get(pk=pk, is_active=True)
    except (ValueError, OverflowError, User.DoesNotExist) as error:
        raise AccountError("invalid_token", "Bad reset link.") from error
    # The token hashes the current password, so it stops working once used. An invitation link
    # (create_player) opens the same page with a longer-lived token of its own.
    if not default_token_generator.check_token(user, token) and not _is_invitation(user, token):
        raise AccountError("invalid_token", "Bad, used or expired reset link.")
    return user


def reset_password(user: User, password: str, ip: str) -> None:
    user.set_password(password)
    user.save(update_fields=["password"])
    if user.email:
        # Following the emailed link proves the address belongs to this person.
        mark_email_verified(user)
        ratelimit.LOGIN_FAILURES_PER_EMAIL.reset(user.email)
        ratelimit.LOGIN_FAILURES_PER_EMAIL_AND_IP.reset(_email_and_ip(user.email, ip))


# --- Guests -----------------------------------------------------------------------------


def _guest_username() -> str:
    while True:
        name = GUEST_PREFIX + secrets.token_hex(3)
        if not username_in_use(name):
            return name


def new_guest(username: str | None = None) -> User:
    """Create (not log in) a guest. Also used by the table for visitors without a session."""
    return User.objects.create_user(username=username or _guest_username(), is_guest=True)


def create_guest(request, username: str | None, ip: str) -> tuple[User, bool]:
    """Log in a new guest. A caller who already has a session keeps it: ``(user, False)``."""
    if request.user.is_authenticated:
        return request.user, False
    ratelimit.GUESTS_PER_IP.hit(ip)
    if username and username_in_use(username):
        raise AccountError("username_taken", "This name is already used.")
    try:
        user = new_guest(username)
    except IntegrityError as error:
        raise AccountError("username_taken", "This name is already used.") from error
    login(request, user, backend=MODEL_BACKEND)
    return user, True


def upgrade_guest(request, email: str, password: str, username: str | None) -> User:
    """Give the logged-in guest an email and password, keeping the same ``User`` row.

    Same primary key, so seats, hands and chip ledger entries in every room stay theirs.
    An email that already belongs to someone else is refused: accounts are never merged.
    """
    email = normalize_email(email)
    try:
        with transaction.atomic():
            lock_email(email)
            user = User.objects.select_for_update().get(pk=request.user.pk)
            if not user.is_guest:
                raise AccountError("not_guest", "Only a guest account can be upgraded.")
            _check_unique(email, username, exclude=user)
            user.email = email
            if username:
                user.username = username
            user.set_password(password)
            user.is_guest = False
            user.save()
            _set_primary_email(user, email)
    except IntegrityError as error:  # lost a race on the unique username
        raise AccountError("username_taken", "This name is already used.") from error
    # A new password changes the session hash; keep this browser logged in.
    update_session_auth_hash(request, user)
    send_verification_email(user)
    return user


def finish_google_upgrade(user: User, email: str) -> None:
    """Called once Google is connected to a guest (see signals.py).

    ``email`` is the address Google says it verified. Checked again under the row lock: another
    tab may have upgraded this guest, or taken this address, since the Google flow started.
    """
    email = normalize_email(email)
    try:
        with transaction.atomic():
            lock_email(email)
            user = User.objects.select_for_update().get(pk=user.pk)
            if not user.is_guest:
                raise AccountError("not_guest", "Only a guest account can be upgraded.")
            if not email or email_in_use(email, exclude=user):
                raise AccountError("email_taken", "This email belongs to another account.")
            user.email = email
            user.is_guest = False
            user.save(update_fields=["email", "is_guest"])
            mark_email_verified(user)
    except IntegrityError as error:
        raise AccountError("email_taken", "This email belongs to another account.") from error
