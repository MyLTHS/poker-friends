"""Turn the EMAIL_URL environment variable into Django's ``MAILERS`` setting.

Imported by config/settings.py, so it must not import Django models.

    (empty) or console://          print emails to the console (development)
    smtp://user:pass@host:587      SMTP with STARTTLS (port 587); other ports without TLS
    smtps://user:pass@host:465     SMTP over implicit SSL

Percent-encode special characters in the user or password (``@`` is ``%40``).
"""

from urllib.parse import unquote, urlsplit

CONSOLE_BACKEND = "django.core.mail.backends.console.EmailBackend"
SMTP_BACKEND = "django.core.mail.backends.smtp.EmailBackend"
STARTTLS_PORT = 587


def mailers_from_url(url: str) -> dict:
    url = url.strip()
    if not url:
        return {"default": {"BACKEND": CONSOLE_BACKEND}}
    parts = urlsplit(url)
    if parts.scheme == "console":
        return {"default": {"BACKEND": CONSOLE_BACKEND}}
    if parts.scheme not in {"smtp", "smtps"}:
        raise ValueError(f"EMAIL_URL must start with smtp://, smtps:// or console://, got {url!r}")

    ssl = parts.scheme == "smtps"
    port = parts.port or (465 if ssl else 25)
    options = {
        "host": parts.hostname or "",
        "port": port,
        "username": unquote(parts.username or ""),
        "password": unquote(parts.password or ""),
        "use_tls": not ssl and port == STARTTLS_PORT,
        "use_ssl": ssl,
        "timeout": 10,
    }
    return {"default": {"BACKEND": SMTP_BACKEND, "OPTIONS": options}}
