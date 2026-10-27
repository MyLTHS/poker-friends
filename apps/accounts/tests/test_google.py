"""Google sign-in through django-allauth, with Google's two HTTP calls faked.

The flow is the real one: POST to /accounts/google/login/ (state saved in the session), Google
redirects back to the callback with a code, allauth swaps it for a token and reads the profile.
Only the two requests to Google are patched.
"""

from unittest.mock import patch
from urllib.parse import parse_qs, urlparse

import pytest
from allauth.account.models import EmailAddress
from allauth.socialaccount.models import SocialAccount
from django.db.models import Sum

from apps.games.models import LedgerEntry, LedgerKind, Room, User

from .conftest import make_verified_user

pytestmark = pytest.mark.django_db

FRONTEND = "http://web.test"
GOOGLE_ON = {
    "GOOGLE_CLIENT_ID": "client-id",
    "GOOGLE_CLIENT_SECRET": "client-secret",
    "FRONTEND_URL": FRONTEND,
    "SOCIALACCOUNT_PROVIDERS": {
        "google": {
            "APPS": [{"client_id": "client-id", "secret": "client-secret"}],
            "SCOPE": ["profile", "email"],
        }
    },
}
GOOGLE_OFF = {**GOOGLE_ON, "GOOGLE_CLIENT_ID": "", "GOOGLE_CLIENT_SECRET": ""}
GOOGLE_OFF["SOCIALACCOUNT_PROVIDERS"] = {"google": {"APPS": []}}


@pytest.fixture
def google_on(settings):
    for name, value in GOOGLE_ON.items():
        setattr(settings, name, value)


@pytest.fixture
def google_off(settings):
    for name, value in GOOGLE_OFF.items():
        setattr(settings, name, value)


def profile(email="gmail@example.com", uid="g-1"):
    return {"id": uid, "email": email, "verified_email": True, "given_name": "Gà"}


def google_flow(client, process="login", google_profile=None):
    """Run the whole redirect dance and return the final redirect to the web app."""
    start = client.post("/accounts/google/login/", {"process": process})
    assert start.status_code == 302, start
    assert start["Location"].startswith("https://accounts.google.com/")
    state = parse_qs(urlparse(start["Location"]).query)["state"][0]
    with (
        patch(
            "allauth.socialaccount.providers.oauth2.client.OAuth2Client.get_access_token",
            return_value={"access_token": "token"},
        ),
        patch(
            "allauth.socialaccount.providers.google.views.GoogleOAuth2Adapter._fetch_user_info",
            return_value=google_profile or profile(),
        ),
    ):
        return client.get("/accounts/google/login/callback/", {"code": "code", "state": state})


def result(response) -> dict[str, str]:
    assert response.status_code == 302
    url = urlparse(response["Location"])
    assert f"{url.scheme}://{url.netloc}" == FRONTEND
    assert url.path == "/account"
    return {key: values[0] for key, values in parse_qs(url.query).items()}


@pytest.mark.usefixtures("google_off")
def test_disabled_google_sends_the_browser_back_with_an_error(client):
    assert result(client.post("/accounts/google/login/")) == {"error": "google_disabled"}
    assert result(client.get("/accounts/google/login/callback/")) == {"error": "google_disabled"}


@pytest.mark.usefixtures("google_on")
class TestGoogleLogin:
    def test_redirects_to_google_with_our_callback(self, client):
        start = client.post("/accounts/google/login/")
        query = parse_qs(urlparse(start["Location"]).query)
        assert query["client_id"] == ["client-id"]
        assert query["redirect_uri"][0].endswith("/accounts/google/login/callback/")

    def test_new_google_user_gets_a_verified_account_and_a_session(self, client):
        response = google_flow(client)

        assert result(response) == {"google": "ok"}
        me = client.get("/api/auth/me/").json()
        assert me["email"] == "gmail@example.com"
        assert me["is_guest"] is False
        assert me["email_verified"] is True
        assert me["google_connected"] is True
        assert me["has_password"] is False

    def test_returning_google_user_logs_into_the_same_account(self, client):
        google_flow(client)
        first = client.get("/api/auth/me/").json()["id"]
        client.post("/api/auth/logout/")

        google_flow(client)

        assert client.get("/api/auth/me/").json()["id"] == first
        assert User.objects.count() == 1

    def test_email_of_an_existing_password_account_is_refused(self, client):
        make_verified_user(email="gmail@example.com")

        response = google_flow(client)

        assert result(response) == {"error": "email_taken"}
        assert client.get("/api/auth/me/").status_code == 401
        assert not SocialAccount.objects.exists()

    def test_cancel_on_google_comes_back_with_an_error(self, client):
        start = client.post("/accounts/google/login/")
        state = parse_qs(urlparse(start["Location"]).query)["state"][0]
        response = client.get(
            "/accounts/google/login/callback/", {"error": "access_denied", "state": state}
        )
        assert result(response) == {"error": "google_failed"}


@pytest.mark.usefixtures("google_on")
class TestGuestUpgradeWithGoogle:
    def test_guest_keeps_the_same_user_and_chips(self, client):
        guest_id = client.post("/api/auth/guest/").json()["id"]
        room = Room.objects.create(name="A", small_blind=1, big_blind=2)
        LedgerEntry.objects.create(room=room, user_id=guest_id, kind=LedgerKind.GRANT, amount=700)

        response = google_flow(client, process="connect")

        assert result(response) == {"google": "ok"}
        me = client.get("/api/auth/me/").json()
        assert me["id"] == guest_id
        assert me["is_guest"] is False
        assert me["email"] == "gmail@example.com"
        assert me["email_verified"] is True
        assert me["google_connected"] is True
        assert User.objects.count() == 1
        total = LedgerEntry.objects.filter(user_id=guest_id).aggregate(t=Sum("amount"))["t"]
        assert total == 700
        assert EmailAddress.objects.get(user_id=guest_id).primary

    def test_google_email_of_another_account_is_refused(self, client):
        make_verified_user(email="gmail@example.com")
        guest_id = client.post("/api/auth/guest/").json()["id"]

        response = google_flow(client, process="connect")

        assert result(response) == {"error": "email_taken"}
        assert User.objects.get(pk=guest_id).is_guest is True
        assert not SocialAccount.objects.filter(user_id=guest_id).exists()

    def test_google_account_linked_to_another_user_is_refused(self, client):
        google_flow(client)
        owner = client.get("/api/auth/me/").json()["id"]
        client.post("/api/auth/logout/")
        guest_id = client.post("/api/auth/guest/").json()["id"]

        response = google_flow(client, process="connect")

        assert result(response) == {"error": "social_account_taken"}
        assert SocialAccount.objects.get().user_id == owner
        assert User.objects.get(pk=guest_id).is_guest is True

    def test_only_guests_can_connect(self, client):
        make_verified_user()
        client.post("/api/auth/login/", {"email": "an@example.com", "password": "sau-con-bai-dep"})

        response = google_flow(client, process="connect")

        assert result(response) == {"error": "not_guest"}
        assert not SocialAccount.objects.exists()
