"""Email/password accounts: sign up, verify, log in/out, forgotten password.

The API is JSON over the Django session cookie (docs/api/openapi.yaml). Errors always look like
``{"code": ..., "message": ...}`` so the web app can switch on ``code``.
"""

from smtplib import SMTPException
from unittest.mock import patch

import pytest
from allauth.account.models import EmailAddress
from django.core import mail
from django.test import override_settings

from apps.games.models import User

from .conftest import PASSWORD, last_link_params, make_verified_user

pytestmark = pytest.mark.django_db


def signup(client, email="binh@example.com", username="binh", password=PASSWORD, **extra):
    return client.post(
        "/api/auth/signup/",
        {"email": email, "username": username, "password": password},
        format="json",
        **extra,
    )


def login(client, email="an@example.com", password=PASSWORD):
    return client.post("/api/auth/login/", {"email": email, "password": password}, format="json")


class TestConfig:
    def test_google_is_off_without_keys(self, client):
        with override_settings(GOOGLE_CLIENT_ID="", GOOGLE_CLIENT_SECRET=""):
            response = client.get("/api/auth/config/")
        assert response.status_code == 200
        assert response.json() == {"google_enabled": False}

    def test_google_is_on_with_both_keys(self, client):
        with override_settings(GOOGLE_CLIENT_ID="id", GOOGLE_CLIENT_SECRET="secret"):
            response = client.get("/api/auth/config/")
        assert response.json() == {"google_enabled": True}

    def test_config_sets_the_csrf_cookie(self, client):
        response = client.get("/api/auth/config/")
        assert "csrftoken" in response.cookies


class TestSignup:
    def test_creates_an_unverified_account_and_emails_a_link(self, client):
        response = signup(client)

        assert response.status_code == 201
        body = response.json()
        assert body["email"] == "binh@example.com"
        assert body["username"] == "binh"
        assert body["is_guest"] is False
        assert body["email_verified"] is False
        user = User.objects.get(email="binh@example.com")
        assert user.check_password(PASSWORD)
        assert len(mail.outbox) == 1
        assert mail.outbox[0].to == ["binh@example.com"]
        assert "token" in last_link_params()

    def test_does_not_log_in_before_verification(self, client):
        signup(client)
        assert client.get("/api/auth/me/").status_code == 401

    def test_email_is_normalised_to_lower_case(self, client):
        signup(client, email="Binh@Example.COM")
        assert User.objects.filter(email="binh@example.com").exists()

    def test_email_already_used_is_refused(self, client):
        make_verified_user(email="binh@example.com", username="someone")
        response = signup(client, email="BINH@example.com")
        assert response.status_code == 409
        assert response.json()["code"] == "email_taken"

    def test_username_already_used_is_refused(self, client):
        make_verified_user(email="other@example.com", username="binh")
        response = signup(client)
        assert response.status_code == 409
        assert response.json()["code"] == "username_taken"

    def test_weak_password_is_a_validation_error(self, client):
        response = signup(client, password="123")
        assert response.status_code == 400
        body = response.json()
        assert body["code"] == "validation_error"
        assert "password" in body["fields"]

    def test_mail_server_failure_still_creates_the_account(self, client):
        # The person can ask for the link again; a 500 would leave them unable to sign up.
        with patch("apps.accounts.services.send_mail", side_effect=SMTPException("down")):
            response = signup(client)
        assert response.status_code == 201
        assert User.objects.filter(email="binh@example.com").exists()

    def test_bad_email_is_a_validation_error(self, client):
        response = signup(client, email="not-an-email")
        assert response.status_code == 400
        assert "email" in response.json()["fields"]


class TestVerifyEmail:
    def test_link_token_verifies_the_email(self, client):
        signup(client)
        token = last_link_params()["token"]

        response = client.post("/api/auth/verify-email/", {"token": token}, format="json")

        assert response.status_code == 200
        assert response.json()["email_verified"] is True
        assert EmailAddress.objects.get(email="binh@example.com").verified

    def test_tampered_token_is_refused(self, client):
        signup(client)
        token = last_link_params()["token"]
        response = client.post("/api/auth/verify-email/", {"token": token + "x"}, format="json")
        assert response.status_code == 400
        assert response.json()["code"] == "invalid_token"

    def test_expired_token_is_refused(self, client):
        signup(client)
        token = last_link_params()["token"]
        with override_settings(ACCOUNTS_EMAIL_VERIFICATION_MAX_AGE=-1):
            response = client.post("/api/auth/verify-email/", {"token": token}, format="json")
        assert response.status_code == 400
        assert response.json()["code"] == "invalid_token"

    def test_token_for_an_old_email_no_longer_works(self, client):
        signup(client)
        token = last_link_params()["token"]
        User.objects.filter(email="binh@example.com").update(email="new@example.com")
        response = client.post("/api/auth/verify-email/", {"token": token}, format="json")
        assert response.json()["code"] == "invalid_token"

    def test_resend_sends_a_new_link_and_hides_unknown_emails(self, client):
        signup(client)
        mail.outbox.clear()

        known = client.post(
            "/api/auth/verify-email/resend/", {"email": "binh@example.com"}, format="json"
        )
        unknown = client.post(
            "/api/auth/verify-email/resend/", {"email": "nobody@example.com"}, format="json"
        )

        assert known.status_code == unknown.status_code == 202
        assert [m.to for m in mail.outbox] == [["binh@example.com"]]


class TestLogin:
    def test_logs_in_with_email_and_password(self, client):
        make_verified_user()

        response = login(client, email="AN@example.com")

        assert response.status_code == 200
        assert response.json()["email"] == "an@example.com"
        assert client.get("/api/auth/me/").json()["username"] == "an"

    def test_wrong_password_and_unknown_email_look_the_same(self, client):
        make_verified_user()
        wrong = login(client, password="wrong-password")
        unknown = login(client, email="nobody@example.com")
        assert wrong.status_code == unknown.status_code == 400
        assert wrong.json()["code"] == unknown.json()["code"] == "invalid_credentials"

    def test_unverified_email_cannot_log_in(self, client):
        signup(client)
        response = login(client, email="binh@example.com")
        assert response.status_code == 403
        assert response.json()["code"] == "email_not_verified"

    def test_inactive_user_cannot_log_in(self, client):
        user = make_verified_user()
        user.is_active = False
        user.save()
        assert login(client).json()["code"] == "invalid_credentials"

    def test_logout_ends_the_session(self, client):
        make_verified_user()
        login(client)

        assert client.post("/api/auth/logout/").status_code == 204
        assert client.get("/api/auth/me/").status_code == 401

    def test_me_without_session_is_not_authenticated(self, client):
        response = client.get("/api/auth/me/")
        assert response.status_code == 401
        assert response.json()["code"] == "not_authenticated"


class TestCsrf:
    def test_post_without_csrf_token_is_refused_even_when_logged_out(self, csrf_client):
        make_verified_user()
        response = login(csrf_client)
        assert response.status_code == 403
        assert response.json()["code"] == "forbidden"

    def test_post_with_the_token_from_config_works(self, csrf_client):
        make_verified_user()
        token = csrf_client.get("/api/auth/config/").cookies["csrftoken"].value
        response = csrf_client.post(
            "/api/auth/login/",
            {"email": "an@example.com", "password": PASSWORD},
            format="json",
            HTTP_X_CSRFTOKEN=token,
        )
        assert response.status_code == 200


class TestPasswordReset:
    def request_reset(self, client, email="an@example.com"):
        return client.post("/api/auth/password/forgot/", {"email": email}, format="json")

    def reset(self, client, params, password="mat-khau-moi-dai"):
        return client.post(
            "/api/auth/password/reset/",
            {"uid": params["uid"], "token": params["token"], "password": password},
            format="json",
        )

    def test_full_flow_sets_the_new_password(self, client):
        user = make_verified_user()

        assert self.request_reset(client).status_code == 202
        assert mail.outbox[-1].to == ["an@example.com"]
        response = self.reset(client, last_link_params())

        assert response.status_code == 204
        user.refresh_from_db()
        assert user.check_password("mat-khau-moi-dai")
        assert login(client, password="mat-khau-moi-dai").status_code == 200

    def test_unknown_email_gets_the_same_answer_and_no_mail(self, client):
        response = self.request_reset(client, email="nobody@example.com")
        assert response.status_code == 202
        assert mail.outbox == []

    def test_link_works_only_once(self, client):
        make_verified_user()
        self.request_reset(client)
        params = last_link_params()
        self.reset(client, params)
        response = self.reset(client, params, password="mot-mat-khau-khac")
        assert response.status_code == 400
        assert response.json()["code"] == "invalid_token"

    def test_weak_new_password_is_refused(self, client):
        make_verified_user()
        self.request_reset(client)
        response = self.reset(client, last_link_params(), password="123")
        assert response.status_code == 400
        assert response.json()["code"] == "validation_error"

    def test_reset_also_verifies_the_email(self, client):
        # Following the link proves the person owns the address.
        signup(client)
        self.request_reset(client, email="binh@example.com")
        self.reset(client, last_link_params())
        assert EmailAddress.objects.get(email="binh@example.com").verified


class TestErrorShape:
    def test_wrong_method_is_an_api_error(self, client):
        response = client.get("/api/auth/login/")
        assert response.status_code == 405
        assert response.json()["code"] == "method_not_allowed"

    def test_wrong_content_type_is_a_validation_error(self, client):
        response = client.post("/api/auth/login/", "email=a", content_type="text/plain")
        assert response.status_code == 415
        assert response.json()["code"] == "validation_error"

    def test_malformed_json_is_a_validation_error(self, client):
        response = client.post("/api/auth/login/", "{", content_type="application/json")
        assert response.status_code == 400
        assert response.json()["code"] == "validation_error"
