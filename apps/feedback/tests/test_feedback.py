"""Player feedback and browser errors for the beta (roadmap F).

Both are write-only over HTTP: players send, only staff read (Django admin).
"""

import importlib
import json
from datetime import UTC, datetime, timedelta
from types import SimpleNamespace

import pytest
from django.apps import apps
from django.core.cache import cache
from django.test import Client

from apps.feedback import views
from apps.feedback.models import ClientError, Feedback
from apps.games.models import Room, User

pytestmark = pytest.mark.django_db
FROZEN_NOW = 1_800_000_000 + 30  # inside one window of every rate limit
WINDOW_START = datetime(2026, 10, 28, 20, 0, tzinfo=UTC)  # a 10-minute window of client errors


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

    def test_the_same_error_on_the_same_page_in_one_10_minute_window_only_counts(self, monkeypatch):
        start = WINDOW_START + timedelta(seconds=5)
        monkeypatch.setattr(views.timezone, "now", lambda: start)
        client = Client()
        for _ in range(3):
            assert post(client, "/api/client-errors/", ERROR).status_code == 204
        row = ClientError.objects.get()
        assert (row.count, row.window_start) == (3, WINDOW_START)

        other_page = post(client, "/api/client-errors/", {**ERROR, "page": "/rooms/2/table"})
        assert other_page.status_code == 204
        assert ClientError.objects.count() == 2

        # still the same window 9 minutes later: counted on the same row
        monkeypatch.setattr(views.timezone, "now", lambda: start + timedelta(minutes=9))
        assert post(client, "/api/client-errors/", ERROR).status_code == 204
        assert ClientError.objects.get(pk=row.pk).count == 4

        # the next window: a new row, the old one keeps its count
        monkeypatch.setattr(views.timezone, "now", lambda: start + timedelta(minutes=11))
        assert post(client, "/api/client-errors/", ERROR).status_code == 204
        assert ClientError.objects.count() == 3
        assert ClientError.objects.get(pk=row.pk).count == 4

    def test_another_release_is_another_error(self):
        client = Client()
        post(client, "/api/client-errors/", ERROR)
        post(client, "/api/client-errors/", {**ERROR, "release": "2026.10.29-d4e5f6"})
        assert sorted(ClientError.objects.values_list("release", "count")) == [
            ("2026.10.28-a1b2c3", 1),
            ("2026.10.29-d4e5f6", 1),
        ]

    def test_two_reports_racing_for_a_new_error_make_one_row(self, monkeypatch):
        # Both find no row; the other request creates it first. This one must count on it, not
        # fail on the unique (fingerprint, window) constraint.
        count_again = views._count_again

        def other_request_wins(fingerprint, window, now):
            monkeypatch.setattr(views, "_count_again", count_again)
            ClientError.objects.create(
                fingerprint=fingerprint, window_start=window, last_seen=now, message="x"
            )
            return 0

        monkeypatch.setattr(views, "_count_again", other_request_wins)
        assert post(Client(), "/api/client-errors/", ERROR).status_code == 204
        assert ClientError.objects.get().count == 2

    def test_rows_stored_before_the_windows_get_one(self):
        # migration 0002 gives old rows the window of their last report and a fingerprint
        # that covers the release
        migration = importlib.import_module("apps.feedback.migrations.0002_clienterror_window")
        row = ClientError.objects.create(
            fingerprint="old",
            window_start=WINDOW_START,
            last_seen=WINDOW_START + timedelta(minutes=27, seconds=3),
            **ERROR,
        )
        migration.fill_windows(apps, None)
        row.refresh_from_db()
        assert row.window_start == WINDOW_START + timedelta(minutes=20)
        assert row.fingerprint == views._fingerprint(ERROR)

    def test_new_errors_stop_at_the_daily_cap_but_repeats_still_count(self, monkeypatch):
        # Not logged in, a new message each time and a fresh IPv6 address dodge the other
        # limits: the table still cannot grow past the cap of new rows a day.
        monkeypatch.setattr(views, "CLIENT_ERRORS_MAX_NEW_PER_DAY", 3)
        client = Client()
        for i in range(3):
            assert (
                post(client, "/api/client-errors/", {**ERROR, "message": f"e{i}"}).status_code
                == 204
            )
        refused = post(client, "/api/client-errors/", {**ERROR, "message": "e3"})
        assert refused.status_code == 429 and refused.json()["code"] == "rate_limited"
        assert ClientError.objects.count() == 3
        # a repeat adds no row, so it is still counted
        assert post(client, "/api/client-errors/", {**ERROR, "message": "e0"}).status_code == 204
        assert ClientError.objects.get(message="e0").count == 2

    def test_the_daily_cap_frees_up_as_the_oldest_row_turns_24_hours_old(self, monkeypatch):
        monkeypatch.setattr(views, "CLIENT_ERRORS_MAX_NEW_PER_DAY", 1)
        monkeypatch.setattr(views.timezone, "now", lambda: WINDOW_START)
        client = Client()
        assert post(client, "/api/client-errors/", {**ERROR, "message": "e0"}).status_code == 204

        an_hour_later = WINDOW_START + timedelta(hours=1)
        monkeypatch.setattr(views.timezone, "now", lambda: an_hour_later)
        refused = post(client, "/api/client-errors/", {**ERROR, "message": "e1"})
        assert refused.status_code == 429
        assert int(refused["Retry-After"]) == 23 * 3600

        a_day_later = WINDOW_START + timedelta(hours=24, seconds=1)
        monkeypatch.setattr(views.timezone, "now", lambda: a_day_later)
        assert post(client, "/api/client-errors/", {**ERROR, "message": "e1"}).status_code == 204

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


class TestFeedbackIsScrubbedToo:
    def test_an_invite_link_pasted_in_the_message_loses_its_token(self, guest):
        link = "https://poker.example/rooms/join?token=secret-invite-token"
        body = {**FEEDBACK, "message": f"Link này không vào được: {link}"}
        assert post(logged_in(guest), "/api/feedback/", body).status_code == 201
        stored = Feedback.objects.get().message
        assert "secret-invite-token" not in stored
        assert stored.startswith("Link này không vào được: https://poker.example/rooms/join?token=")

    def test_a_token_in_the_page_of_feedback_is_not_stored(self, guest):
        body = {**FEEDBACK, "page": "/rooms/join?token=secret-invite-token"}
        assert post(logged_in(guest), "/api/feedback/", body).status_code == 201
        assert "secret-invite-token" not in Feedback.objects.get().page
