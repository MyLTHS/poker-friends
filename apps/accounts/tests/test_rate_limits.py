"""Login and forgotten-password requests are rate limited per IP and per email."""

import pytest
from django.core import mail

from apps.accounts import ratelimit

from .conftest import PASSWORD, make_verified_user

pytestmark = pytest.mark.django_db


def login(client, email="an@example.com", password="wrong", ip="10.0.0.1"):
    return client.post(
        "/api/auth/login/",
        {"email": email, "password": password},
        format="json",
        REMOTE_ADDR=ip,
    )


def forgot(client, email="an@example.com", ip="10.0.0.1"):
    return client.post(
        "/api/auth/password/forgot/", {"email": email}, format="json", REMOTE_ADDR=ip
    )


class TestLogin:
    def test_failures_from_one_ip_block_that_ip_even_with_the_right_password(self, client):
        make_verified_user()
        for _ in range(ratelimit.LOGIN_FAILURES_PER_EMAIL_AND_IP.limit):
            assert login(client).status_code == 400

        response = login(client, password=PASSWORD)

        assert response.status_code == 429
        assert response.json()["code"] == "rate_limited"
        assert int(response["Retry-After"]) > 0

    def test_someone_guessing_from_elsewhere_does_not_lock_the_owner_out(self, client):
        make_verified_user()
        for _ in range(ratelimit.LOGIN_FAILURES_PER_EMAIL_AND_IP.limit):
            login(client, ip="10.6.6.6")
        assert login(client, password=PASSWORD, ip="10.0.0.2").status_code == 200

    def test_guessing_one_email_from_many_ips_is_capped(self, client):
        make_verified_user()
        for i in range(ratelimit.LOGIN_FAILURES_PER_EMAIL.limit):
            login(client, ip=f"10.0.{i // 200}.{i % 200}")
        assert login(client, password=PASSWORD, ip="10.9.9.9").status_code == 429

    def test_another_email_is_not_blocked(self, client):
        make_verified_user()
        make_verified_user(email="binh@example.com", username="binh")
        for _ in range(ratelimit.LOGIN_FAILURES_PER_EMAIL_AND_IP.limit):
            login(client)
        assert login(client, email="binh@example.com", password=PASSWORD).status_code == 200

    def test_success_clears_the_failure_count(self, client):
        make_verified_user()
        for _ in range(ratelimit.LOGIN_FAILURES_PER_EMAIL_AND_IP.limit - 1):
            login(client)
        assert login(client, password=PASSWORD).status_code == 200
        client.post("/api/auth/logout/")
        assert login(client).status_code == 400

    def test_too_many_attempts_from_one_ip_are_blocked(self, client):
        for i in range(ratelimit.LOGIN_ATTEMPTS_PER_IP.limit):
            login(client, email=f"user{i}@example.com")
        response = login(client, email="fresh@example.com")
        assert response.status_code == 429

    def test_another_ip_is_not_blocked(self, client):
        for i in range(ratelimit.LOGIN_ATTEMPTS_PER_IP.limit):
            login(client, email=f"user{i}@example.com")
        assert login(client, email="fresh@example.com", ip="10.9.9.9").status_code == 400


class TestClientIp:
    """Behind a reverse proxy every request comes from the proxy; the real IP is in a header."""

    def test_without_a_trusted_proxy_the_header_is_ignored(self, client, settings):
        settings.ACCOUNTS_TRUSTED_PROXIES = 0
        for i in range(ratelimit.LOGIN_ATTEMPTS_PER_IP.limit):
            client.post(
                "/api/auth/login/",
                {"email": f"u{i}@example.com", "password": "x"},
                format="json",
                HTTP_X_FORWARDED_FOR=f"10.1.0.{i}",
            )
        assert login(client, email="fresh@example.com", ip="127.0.0.1").status_code == 429

    def test_with_one_trusted_proxy_the_last_forwarded_address_counts(self, client, settings):
        settings.ACCOUNTS_TRUSTED_PROXIES = 1
        for i in range(ratelimit.LOGIN_ATTEMPTS_PER_IP.limit):
            # A client can prepend fake addresses; only the one our proxy appended is used.
            client.post(
                "/api/auth/login/",
                {"email": f"u{i}@example.com", "password": "x"},
                format="json",
                REMOTE_ADDR="127.0.0.1",
                HTTP_X_FORWARDED_FOR=f"6.6.6.{i}, 10.1.0.{i}",
            )
        fresh = client.post(
            "/api/auth/login/",
            {"email": "fresh@example.com", "password": "x"},
            format="json",
            REMOTE_ADDR="127.0.0.1",
            HTTP_X_FORWARDED_FOR="10.2.0.1",
        )
        assert fresh.status_code == 400


class TestForgotPassword:
    def test_too_many_requests_for_one_email_are_blocked(self, client):
        make_verified_user()
        for i in range(ratelimit.PASSWORD_RESET_PER_EMAIL.limit):
            assert forgot(client, ip=f"10.0.1.{i}").status_code == 202
        sent = len(mail.outbox)

        response = forgot(client, ip="10.0.2.1")

        assert response.status_code == 429
        assert len(mail.outbox) == sent

    def test_too_many_requests_from_one_ip_are_blocked(self, client):
        for i in range(ratelimit.PASSWORD_RESET_PER_IP.limit):
            forgot(client, email=f"user{i}@example.com")
        assert forgot(client, email="fresh@example.com").status_code == 429


class TestEmailSendingEndpoints:
    def test_signups_from_one_ip_are_limited(self, client):
        for i in range(ratelimit.EMAIL_SENDS_PER_IP.limit):
            client.post(
                "/api/auth/signup/",
                {"email": f"u{i}@example.com", "username": f"u{i}", "password": PASSWORD},
                format="json",
            )
        response = client.post(
            "/api/auth/signup/",
            {"email": "last@example.com", "username": "last", "password": PASSWORD},
            format="json",
        )
        assert response.status_code == 429

    def test_guest_upgrades_from_one_ip_are_limited(self, client):
        from rest_framework.test import APIClient

        for i in range(ratelimit.EMAIL_SENDS_PER_IP.limit):
            guest = APIClient()
            guest.post("/api/auth/guest/", REMOTE_ADDR="10.3.0.1")
            response = guest.post(
                "/api/auth/upgrade/",
                {"email": f"g{i}@example.com", "password": PASSWORD},
                format="json",
                REMOTE_ADDR="10.3.0.1",
            )
            assert response.status_code == 200
        guest = APIClient()
        guest.post("/api/auth/guest/", REMOTE_ADDR="10.3.0.1")
        response = guest.post(
            "/api/auth/upgrade/",
            {"email": "last@example.com", "password": PASSWORD},
            format="json",
            REMOTE_ADDR="10.3.0.1",
        )
        assert response.status_code == 429

    def test_guest_limit_comes_from_settings_and_stays_20_by_default(self):
        from django.conf import settings

        assert settings.ACCOUNTS_GUESTS_PER_IP_HOUR == 20
        assert ratelimit.GUESTS_PER_IP.limit == settings.ACCOUNTS_GUESTS_PER_IP_HOUR

    def test_guest_creation_from_one_ip_is_limited(self, client):
        from rest_framework.test import APIClient

        for _ in range(ratelimit.GUESTS_PER_IP.limit):
            assert APIClient().post("/api/auth/guest/").status_code == 201
        assert APIClient().post("/api/auth/guest/").status_code == 429
