"""EMAIL_URL → Django's MAILERS. No URL means emails go to the console (dev)."""

import pytest

from apps.accounts.email_config import mailers_from_url

CONSOLE = {"default": {"BACKEND": "apps.accounts.console_email.EmailBackend"}}
SMTP = "django.core.mail.backends.smtp.EmailBackend"


def test_no_url_prints_emails_to_the_console():
    assert mailers_from_url("") == CONSOLE


def test_console_scheme_prints_emails_to_the_console():
    assert mailers_from_url("console://") == CONSOLE


def test_smtp_on_587_uses_starttls():
    mailers = mailers_from_url("smtp://me%40gmail.com:app%20pass@smtp.gmail.com:587")
    assert mailers == {
        "default": {
            "BACKEND": SMTP,
            "OPTIONS": {
                "host": "smtp.gmail.com",
                "port": 587,
                "username": "me@gmail.com",
                "password": "app pass",
                "use_tls": True,
                "use_ssl": False,
                "timeout": 10,
            },
        }
    }


def test_smtps_uses_implicit_ssl_and_defaults_to_465():
    options = mailers_from_url("smtps://user:pw@mail.example.com")["default"]["OPTIONS"]
    assert options["port"] == 465
    assert options["use_ssl"] is True
    assert options["use_tls"] is False


def test_plain_smtp_without_port_defaults_to_25_without_tls():
    options = mailers_from_url("smtp://localhost")["default"]["OPTIONS"]
    assert options["port"] == 25
    assert options["use_tls"] is False
    assert options["username"] == ""


def test_unknown_scheme_is_rejected():
    with pytest.raises(ValueError, match="EMAIL_URL"):
        mailers_from_url("http://example.com")


def test_console_backend_prints_the_body_as_plain_text():
    import io

    from django.core.mail import EmailMessage

    from apps.accounts.console_email import EmailBackend

    stream = io.StringIO()
    body = "Bấm link: http://localhost:3000/account/verify?token=abc&x=1"
    EmailBackend(stream=stream, alias="test").send_messages(
        [EmailMessage("Xác minh", body, "a@example.com", ["b@example.com"])]
    )
    assert body in stream.getvalue()
    assert "Subject: Xác minh" in stream.getvalue()
