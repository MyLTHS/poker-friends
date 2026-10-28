"""Django settings.

Everything that differs between environments comes from environment variables
(see .env.example). Defaults are for local development only.
"""

import os
from pathlib import Path

import dj_database_url

BASE_DIR = Path(__file__).resolve().parent.parent


def env_bool(name: str, default: bool = False) -> bool:
    return os.environ.get(name, str(default)).lower() in {"1", "true", "yes"}


def env_list(name: str, default: str = "") -> list[str]:
    return [item.strip() for item in os.environ.get(name, default).split(",") if item.strip()]


# Off unless asked for: a server started without its configuration must never show debug pages.
# Development turns it on with DJANGO_DEBUG=true (.env.example); manage.py does that by itself
# when no DJANGO_SECRET_KEY is set, and pytest through config/settings_test.py.
DEBUG = env_bool("DJANGO_DEBUG", False)
SECRET_KEY = os.environ.get("DJANGO_SECRET_KEY", "dev-only-insecure-key")
WEAK_SECRET_KEYS = {"dev-only-insecure-key", "change-me"}
if not DEBUG and (SECRET_KEY in WEAK_SECRET_KEYS or len(SECRET_KEY) < 32):
    raise RuntimeError(
        "Set a strong DJANGO_SECRET_KEY (32+ chars) when DJANGO_DEBUG is off. "
        "For local development set DJANGO_DEBUG=true (see .env.example)."
    )

ALLOWED_HOSTS = env_list("DJANGO_ALLOWED_HOSTS", "localhost,127.0.0.1")
CSRF_TRUSTED_ORIGINS = env_list("DJANGO_CSRF_TRUSTED_ORIGINS")

INSTALLED_APPS = [
    "daphne",
    "django.contrib.admin",
    "django.contrib.auth",
    "django.contrib.contenttypes",
    "django.contrib.sessions",
    "django.contrib.messages",
    "django.contrib.staticfiles",
    "rest_framework",
    "channels",
    "apps.games",
]

AUTH_USER_MODEL = "games.User"

MIDDLEWARE = [
    "django.middleware.security.SecurityMiddleware",
    "django.contrib.sessions.middleware.SessionMiddleware",
    "django.middleware.common.CommonMiddleware",
    "django.middleware.csrf.CsrfViewMiddleware",
    "django.contrib.auth.middleware.AuthenticationMiddleware",
    "django.contrib.messages.middleware.MessageMiddleware",
    "django.middleware.clickjacking.XFrameOptionsMiddleware",
]

ROOT_URLCONF = "config.urls"

TEMPLATES = [
    {
        "BACKEND": "django.template.backends.django.DjangoTemplates",
        "DIRS": [],
        "APP_DIRS": True,
        "OPTIONS": {
            "context_processors": [
                "django.template.context_processors.request",
                "django.contrib.auth.context_processors.auth",
                "django.contrib.messages.context_processors.messages",
            ],
        },
    },
]

WSGI_APPLICATION = "config.wsgi.application"
ASGI_APPLICATION = "config.asgi.application"

# Local runs without Docker fall back to SQLite; Docker and CI set DATABASE_URL to Postgres.
DATABASES = {
    "default": dj_database_url.config(
        default=f"sqlite:///{BASE_DIR / 'db.sqlite3'}",
        conn_max_age=60,
    )
}

# Empty in production: one Daphne process, so the in-memory layer is enough and does not drop
# messages when a socket closes (ADR-001, "Bỏ Redis"). Kept for a multi-process setup.
REDIS_URL = os.environ.get("REDIS_URL")
# redis-py times a read out after 5 seconds by default, exactly how long channels_redis blocks
# waiting for a message, so every socket quiet for 5 seconds died with 1011. Any longer read
# timeout fixes it; a socket_timeout in REDIS_URL's query string still wins over this one.
REDIS_SOCKET_TIMEOUT = 15
CHANNEL_LAYERS = {
    "default": (
        {
            "BACKEND": "channels_redis.core.RedisChannelLayer",
            "CONFIG": {"hosts": [{"address": REDIS_URL, "socket_timeout": REDIS_SOCKET_TIMEOUT}]},
        }
        if REDIS_URL
        else {"BACKEND": "channels.layers.InMemoryChannelLayer"}
    )
}

AUTH_PASSWORD_VALIDATORS = [
    {"NAME": "django.contrib.auth.password_validation.UserAttributeSimilarityValidator"},
    {"NAME": "django.contrib.auth.password_validation.MinimumLengthValidator"},
    {"NAME": "django.contrib.auth.password_validation.CommonPasswordValidator"},
    {"NAME": "django.contrib.auth.password_validation.NumericPasswordValidator"},
]

LANGUAGE_CODE = "vi"
TIME_ZONE = "Asia/Ho_Chi_Minh"
USE_I18N = True
USE_TZ = True

STATIC_URL = "static/"
STATIC_ROOT = BASE_DIR / "staticfiles"

DEFAULT_AUTO_FIELD = "django.db.models.BigAutoField"

# --- Accounts (B6) ------------------------------------------------------------------------
# Kept in one block, appended rather than edited in place, so it merges cleanly with other
# phases that touch the lists above. Details: apps/accounts/ and docs/huong-dan-google-smtp.md.
from apps.accounts.email_config import mailers_from_url  # noqa: E402

INSTALLED_APPS += [
    "allauth",
    "allauth.account",
    "allauth.socialaccount",
    "allauth.socialaccount.providers.google",
    "apps.accounts",
]
MIDDLEWARE += [
    "allauth.account.middleware.AccountMiddleware",
    "apps.accounts.middleware.remember_origin",
]
CSRF_FAILURE_VIEW = "apps.accounts.views.csrf_failure"  # JSON ApiError under /api/
AUTHENTICATION_BACKENDS = [
    "django.contrib.auth.backends.ModelBackend",
    "allauth.account.auth_backends.AuthenticationBackend",
]

# Behind an HTTPS reverse proxy (Caddy) that sets X-Forwarded-Proto: build https:// URLs (the
# Google callback), send cookies over HTTPS only, redirect plain http:// and tell browsers to use
# HTTPS only (HSTS). HSTS starts at 30 days, without subdomains or the preload list, so it is
# easy to undo while the domain is new; raise DJANGO_HSTS_SECONDS once HTTPS has been stable.
# See docs/deploy.md.
SECURE_SSL_REDIRECT = False
SECURE_HSTS_SECONDS = 0
if env_bool("DJANGO_BEHIND_HTTPS_PROXY"):
    SECURE_PROXY_SSL_HEADER = ("HTTP_X_FORWARDED_PROTO", "https")
    SESSION_COOKIE_SECURE = CSRF_COOKIE_SECURE = True
    SECURE_SSL_REDIRECT = True
    SECURE_HSTS_SECONDS = int(os.environ.get("DJANGO_HSTS_SECONDS", str(30 * 24 * 60 * 60)))
    SECURE_HSTS_INCLUDE_SUBDOMAINS = env_bool("DJANGO_HSTS_INCLUDE_SUBDOMAINS")

# Reverse proxies (Caddy, ...) in front of Django; rate limits then read the client IP from
# X-Forwarded-For. 0 = none, use the connection's address.
ACCOUNTS_TRUSTED_PROXIES = int(os.environ.get("TRUSTED_PROXIES", "0"))

# New guest accounts per client IP per hour. Leave it at 20; only the E2E server raises it, because
# the whole suite makes its guests from one address (web/playwright.config.ts).
ACCOUNTS_GUESTS_PER_IP_HOUR = int(os.environ.get("GUESTS_PER_IP_HOUR", "20"))

# Links in emails and the end of the Google flow point at the web app, not at Django.
FRONTEND_URL = os.environ.get("FRONTEND_URL", "http://localhost:3000").rstrip("/")
# Links in emails follow the address the player used, not FRONTEND_URL: playing from home the
# tunnel's address changes on every start (apps/accounts/middleware.py).
FRONTEND_URL_FROM_REQUEST = env_bool("FRONTEND_URL_FROM_REQUEST")
if FRONTEND_URL not in CSRF_TRUSTED_ORIGINS:
    CSRF_TRUSTED_ORIGINS.append(FRONTEND_URL)

# No EMAIL_URL: emails are printed to the console (dev). See apps/accounts/email_config.py.
MAILERS = mailers_from_url(os.environ.get("EMAIL_URL", ""))
DEFAULT_FROM_EMAIL = os.environ.get("DEFAULT_FROM_EMAIL", "Poker Friends <no-reply@localhost>")
PASSWORD_RESET_TIMEOUT = 60 * 60

# Google sign-in is on only when both values are set; the web app hides the button otherwise.
GOOGLE_CLIENT_ID = os.environ.get("GOOGLE_CLIENT_ID", "")
GOOGLE_CLIENT_SECRET = os.environ.get("GOOGLE_CLIENT_SECRET", "")
SOCIALACCOUNT_PROVIDERS = {
    "google": {
        "APPS": (
            [{"client_id": GOOGLE_CLIENT_ID, "secret": GOOGLE_CLIENT_SECRET}]
            if GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET
            else []
        ),
        "SCOPE": ["profile", "email"],
    }
}
# allauth only runs the Google flow; email/password, verification and guests live in our own
# JSON API (apps/accounts/views.py), so allauth's own email handling stays off.
ACCOUNT_ADAPTER = "apps.accounts.adapters.AccountAdapter"
SOCIALACCOUNT_ADAPTER = "apps.accounts.adapters.SocialAccountAdapter"
ACCOUNT_LOGIN_METHODS = {"email"}
ACCOUNT_SIGNUP_FIELDS = ["email*", "username*", "password1*"]
ACCOUNT_EMAIL_VERIFICATION = "none"
SOCIALACCOUNT_EMAIL_VERIFICATION = "none"
SOCIALACCOUNT_EMAIL_AUTHENTICATION = False
SOCIALACCOUNT_AUTO_SIGNUP = True
SOCIALACCOUNT_STORE_TOKENS = False

# The table's own log (apps/games/actor.py): rejected commands at INFO (ADR-001 mục 3), suspended
# rooms at CRITICAL. Without a handler of its own, Python would drop everything under WARNING.
LOGGING = {
    "version": 1,
    "disable_existing_loggers": False,
    "handlers": {"console": {"class": "logging.StreamHandler"}},
    "loggers": {
        "games": {"handlers": ["console"], "level": "INFO"},
    },
}

# --- Feedback (F, beta) -------------------------------------------------------------------
# Player feedback and browser errors: write-only API, read in the admin (apps/feedback/).
INSTALLED_APPS += ["apps.feedback"]
