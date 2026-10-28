"""Player feedback and browser errors for the beta (roadmap F).

Both are write-only over HTTP: players send, only staff read (Django admin).
"""

import json
from datetime import timedelta
from types import SimpleNamespace

import pytest
from django.core.cache import cache
from django.test import Client
from django.utils import timezone

from apps.feedback import views
from apps.feedback.models import ClientError, Feedback
from apps.games.models import Room, User

pytestmark = pytest.mark.django_db
FROZEN_NOW = 1_800_000_000 + 30  # inside one window of every rate limit


@pytest.fixture(autouse=True)
def _fresh_rate_limits(monkeypatch):
    cache.clear()
    monkeypatch.setattr("apps.accounts.ratelimit.time", SimpleNamespace(time=lambda: FROZEN_NOW))


def logged_in(user: User, **client_kwargs) -> Client:
    client = Client(**client_kwargs)
    client.force_login(user)
    return client


def post(client: Client, path: str, body: dict, **headers):
    return client.post(path, json.dumps(body), content_type="application/json", **headers)


@pytest.fixture
def guest() -> User:
    return User.objects.create_user(username="khach-1", is_guest=True)


FEEDBACK = {"kind": "bug", "message": "Nút call bấm hai lần mới ăn.", "page": "/rooms/1/table"}


class TestFeedback:
    def test_a_guest_sends_feedback_with_every_field(self, guest):
        room = Room.objects.create(name="Bàn", small_blind=1, big_blind=2)
        response = post(
            logged_in(guest),
            "/api/feedback/",
            {**FEEDBACK, "room_id": room.pk},
            HTTP_USER_AGENT="Mozilla/5.0 (iPhone)",
        )
        assert response.status_code == 201
        item = Feedback.objects.get(pk=response.json()["feedback_id"])
        assert (item.user, item.room, item.kind) == (guest, room, "bug")
        assert item.message == FEEDBACK["message"]
        assert item.page == "/rooms/1/table"
        assert item.user_agent == "Mozilla/5.0 (iPhone)"  # from the request, not the body

    def test_room_and_page_are_optional(self, guest):
        response = post(
            logged_in(guest), "/api/feedback/", {"kind": "idea", "message": "Thêm âm thanh."}
        )
        assert response.status_code == 201
        item = Feedback.objects.get()
        assert item.room is None and item.page == ""

    @pytest.mark.parametrize(
        ("body", "field"),
        [
            ({**FEEDBACK, "message": "   "}, "message"),
            ({**FEEDBACK, "message": "x" * 2001}, "message"),
            ({**FEEDBACK, "kind": "rant"}, "kind"),
            ({**FEEDBACK, "page": "/" + "x" * 500}, "page"),
            ({**FEEDBACK, "room_id": "1"}, "room_id"),
            ({**FEEDBACK, "player_id": "2"}, "player_id"),
        ],
    )
    def test_a_bad_body_is_refused_field_by_field(self, guest, body, field):
        response = post(logged_in(guest), "/api/feedback/", body)
        assert response.status_code == 400
        assert response.json()["code"] == "validation_error"
        assert field in response.json()["fields"]
        assert not Feedback.objects.exists()

    def test_2000_characters_is_still_fine(self, guest):
        response = post(logged_in(guest), "/api/feedback/", {**FEEDBACK, "message": "x" * 2000})
        assert response.status_code == 201

    def test_a_room_the_player_cannot_see_is_refused_like_a_missing_one(self, guest):
        owner = User.objects.create_user(username="chu")
        private = Room.objects.create(
            name="Riêng", small_blind=1, big_blind=2, owner=owner, is_private=True
        )
        for room_id in (private.pk, 99999):
            response = post(logged_in(guest), "/api/feedback/", {**FEEDBACK, "room_id": room_id})
            assert response.status_code == 400
            assert "room_id" in response.json()["fields"]

    def test_not_logged_in_is_refused(self):
        response = post(Client(), "/api/feedback/", FEEDBACK)
        assert response.status_code == 401
        assert response.json()["code"] == "not_authenticated"

    def test_csrf_is_required(self, guest):
        response = post(logged_in(guest, enforce_csrf_checks=True), "/api/feedback/", FEEDBACK)
        assert response.status_code == 403
        assert not Feedback.objects.exists()

    def test_ten_an_hour_per_player(self, guest):
        client = logged_in(guest)
        limit = views.FEEDBACK_PER_USER.limit
        for _ in range(limit):
            assert post(client, "/api/feedback/", FEEDBACK).status_code == 201
        refused = post(client, "/api/feedback/", FEEDBACK)
        assert refused.status_code == 429 and int(refused["Retry-After"]) > 0
        assert Feedback.objects.count() == limit
        # another player is not affected
        other = User.objects.create_user(username="khach-2", is_guest=True)
        assert post(logged_in(other), "/api/feedback/", FEEDBACK).status_code == 201

    def test_nobody_reads_feedback_over_http(self, guest):
        post(logged_in(guest), "/api/feedback/", FEEDBACK)
        other = logged_in(User.objects.create_user(username="khach-2", is_guest=True))
        assert other.get("/api/feedback/").status_code == 405
        assert other.get(f"/api/feedback/{Feedback.objects.get().pk}/").status_code == 404


ERROR = {
    "message": "TypeError: hand is null",
    "stack": "at TableScreen (TableScreen.tsx:120:7)",
    "page": "/rooms/1/table",
    "user_agent": "Mozilla/5.0 (Macintosh)",
    "release": "2026.10.28-a1b2c3",
}


class TestClientErrors:
    def test_a_report_is_stored_with_every_field(self, guest):
        response = post(logged_in(guest), "/api/client-errors/", ERROR)
        assert response.status_code == 204
        row = ClientError.objects.get()
        assert (row.message, row.stack, row.page) == (
            ERROR["message"],
            ERROR["stack"],
            ERROR["page"],
        )
        assert (row.user_agent, row.release, row.user, row.count) == (
            ERROR["user_agent"],
            ERROR["release"],
            guest,
            1,
        )

    def test_a_visitor_who_is_not_logged_in_can_report_too(self):
        response = post(Client(), "/api/client-errors/", {"message": "ChunkLoadError", "page": "/"})
        assert response.status_code == 204
        assert ClientError.objects.get().user is None

    def test_the_message_is_required(self):
        response = post(Client(), "/api/client-errors/", {**ERROR, "message": ""})
        assert response.status_code == 400 and "message" in response.json()["fields"]

    def test_unknown_fields_and_wrong_types_are_refused(self):
        assert post(Client(), "/api/client-errors/", {**ERROR, "cookies": "x"}).status_code == 400
        assert post(Client(), "/api/client-errors/", {**ERROR, "stack": 42}).status_code == 400

    def test_long_fields_are_cut_to_their_limits(self):
        long = {
            "message": "m" * 5000,
            "stack": "s" * 50_000,
            "page": "/" + "p" * 5000,
            "user_agent": "u" * 5000,
            "release": "r" * 500,
        }
        assert post(Client(), "/api/client-errors/", long).status_code == 204
        row = ClientError.objects.get()
        limits = views.CLIENT_ERROR_LIMITS
        for field, limit in limits.items():
            assert len(getattr(row, field)) == limit, field

    def test_the_same_error_on_the_same_page_within_10_minutes_only_counts(self, monkeypatch):
        client = Client()
        for _ in range(3):
            assert post(client, "/api/client-errors/", ERROR).status_code == 204
        row = ClientError.objects.get()
        assert row.count == 3

        other_page = post(client, "/api/client-errors/", {**ERROR, "page": "/rooms/2/table"})
        assert other_page.status_code == 204
        assert ClientError.objects.count() == 2

        later = timezone.now() + timedelta(minutes=11)
        monkeypatch.setattr(views.timezone, "now", lambda: later)
        assert post(client, "/api/client-errors/", ERROR).status_code == 204
        assert ClientError.objects.count() == 3
        assert ClientError.objects.get(pk=row.pk).count == 3

    def test_rate_limited_per_player(self, guest):
        client = logged_in(guest)
        for i in range(views.CLIENT_ERRORS_PER_USER.limit):
            assert (
                post(client, "/api/client-errors/", {**ERROR, "message": f"e{i}"}).status_code
                == 204
            )
        refused = post(client, "/api/client-errors/", ERROR)
        assert refused.status_code == 429 and int(refused["Retry-After"]) > 0

    def test_a_player_in_an_error_loop_does_not_use_up_the_shared_address(self, guest):
        # Friends at one party share one address: a page throwing in a loop on one phone is
        # stopped by that player's own cap, before it counts against everyone's.
        looping = logged_in(guest)
        for i in range(views.CLIENT_ERRORS_PER_IP.limit + 10):
            post(looping, "/api/client-errors/", {**ERROR, "message": f"e{i}"})
        assert post(looping, "/api/client-errors/", ERROR).status_code == 429
        friend = logged_in(User.objects.create_user(username="khach-2", is_guest=True))
        assert post(friend, "/api/client-errors/", ERROR).status_code == 204

    def test_rate_limited_per_address(self):
        client = Client()  # not logged in: only the address counts
        for i in range(views.CLIENT_ERRORS_PER_IP.limit):
            assert (
                post(client, "/api/client-errors/", {**ERROR, "message": f"e{i}"}).status_code
                == 204
            )
        assert post(client, "/api/client-errors/", ERROR).status_code == 429

    def test_cookies_hole_cards_and_link_tokens_are_never_stored(self, guest):
        client = logged_in(guest)
        client.cookies["sessionid"] = client.cookies["sessionid"].value  # a real session cookie
        leaky = {
            "message": "Failed: sessionid=abc123secret; csrftoken=tok456",
            "stack": 'state {"cards":["As","Kd"],"deck":["2c","3d"]} Cookie: sessionid=abc',
            "page": "/account/reset?uid=4&token=c9x-reset-token#top",
        }
        assert post(client, "/api/client-errors/", leaky).status_code == 204
        row = ClientError.objects.get()
        stored = " ".join([row.message, row.stack, row.page, row.user_agent])
        for secret in ("abc123secret", "tok456", '"As"', '"Kd"', '"2c"', "c9x-reset-token"):
            assert secret not in stored, secret
        assert client.cookies["sessionid"].value not in stored
        assert "[đã xoá]" in row.message and row.page.startswith("/account/reset?uid=")

    def test_nobody_reads_errors_over_http(self, guest):
        post(Client(), "/api/client-errors/", ERROR)
        assert logged_in(guest).get("/api/client-errors/").status_code == 405


class TestFeedbackPageIsScrubbedToo:
    def test_a_token_in_the_page_of_feedback_is_not_stored(self, guest):
        body = {**FEEDBACK, "page": "/rooms/join?token=secret-invite-token"}
        assert post(logged_in(guest), "/api/feedback/", body).status_code == 201
        assert "secret-invite-token" not in Feedback.objects.get().page
