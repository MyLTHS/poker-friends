"""Members only (GUESTS_ALLOWED off, playing from home and production): nobody without an account
reaches the rooms, over REST or WebSocket, and no guest is made on the fly. Any real account is
in: a friend signs up on the link and plays, nobody has to verify or let them in."""

import pytest
from channels.testing import WebsocketCommunicator
from django.contrib.auth.models import AnonymousUser
from django.test import AsyncClient, Client, override_settings

from apps.games.consumers import LOGIN_REQUIRED_CLOSE_CODE, RoomConsumer
from apps.games.models import Room, User

from .test_actor import FakeSession, heads_up_room, make_room, run_async
from .test_rooms import alogged_in, apost

pytestmark = [pytest.mark.django_db(transaction=True), pytest.mark.usefixtures("members_only")]


@pytest.fixture
def members_only(settings):
    settings.GUESTS_ALLOWED = False


def member(name="an"):
    """A friend who just signed up: email not verified, and nobody has looked at it."""
    return User.objects.create_user(username=name, email=f"{name}@example.com", password="x" * 12)


def guest(name="khach-1"):
    return User.objects.create_user(username=name, is_guest=True)


def switched_off(name="tat"):
    """An account staff turned off in /admin/ (is_active)."""
    return User.objects.create_user(username=name, email=f"{name}@example.com", is_active=False)


class TestRest:
    def test_the_login_screen_says_guests_are_off_and_no_guest_can_be_made(self):
        client = Client()
        assert client.get("/api/auth/config/").json()["guests_allowed"] is False
        response = client.post("/api/auth/guest/", {}, content_type="application/json")
        assert response.status_code == 403
        assert response.json()["code"] == "guests_disabled"
        assert not User.objects.filter(is_guest=True).exists()

    def test_any_account_sees_the_rooms_a_stranger_or_guest_does_not(self):
        make_room()
        staff = User.objects.create_user(username="admin", is_staff=True)
        for who, expected in ((None, 401), (guest(), 401), (member(), 200), (staff, 200)):
            client = Client()
            if who is not None:
                client.force_login(who)
            response = client.get("/api/rooms/")
            assert response.status_code == expected, who
            if expected != 200:
                assert response.json()["code"] == "login_required"

    def test_an_invite_link_no_longer_makes_a_guest(self):
        room = make_room(is_private=True, invite_token="the-token")
        friend = member()
        invite = {"invite_token": "the-token"}

        async def body():
            assert (await apost(AsyncClient(), "/api/rooms/join/", invite)).status_code == 401
            ok = await apost(await alogged_in(friend), "/api/rooms/join/", invite)
            assert ok.status_code == 200

        run_async(body)
        assert not User.objects.filter(is_guest=True).exists()
        assert Room.objects.get(pk=room.pk).members.count() == 1

    def test_signing_up_lets_a_friend_straight_in(self):
        make_room()
        client = Client()
        signup = client.post(
            "/api/auth/signup/",
            {"email": "moi@example.com", "username": "moi", "password": "mat-khau-dai-123"},
            content_type="application/json",
        )
        assert signup.status_code == 201
        assert signup.json()["member"] is True
        assert client.get("/api/rooms/").status_code == 200  # logged in already

    def test_logging_in_needs_no_verified_email(self):
        member("la")
        client = Client()
        body = {"email": "la@example.com", "password": "x" * 12}
        login = client.post("/api/auth/login/", body, content_type="application/json")
        assert login.status_code == 200
        assert login.json()["member"] is True


class TestWebSocket:
    def connect_as(self, room, user):
        communicator = WebsocketCommunicator(RoomConsumer.as_asgi(), f"/ws/rooms/{room.pk}/")
        communicator.scope["url_route"] = {"kwargs": {"room_id": str(room.pk)}}
        communicator.scope["user"] = user
        communicator.scope["session"] = FakeSession()
        return communicator

    def test_strangers_guests_and_switched_off_accounts_are_closed_with_4401(self):
        room, a, b = heads_up_room()

        async def body():
            strangers = (AnonymousUser(), await _async(guest), await _async(switched_off))
            for who in strangers:
                conn = self.connect_as(room, who)
                connected, code = await conn.connect()
                if connected:  # accepted, then closed with the reason (like a kick)
                    closed = await conn.receive_output(timeout=2)
                    code = closed.get("code")
                assert code == LOGIN_REQUIRED_CLOSE_CODE, who
                await conn.disconnect()
            conn = self.connect_as(room, a)
            connected, _ = await conn.connect()
            assert connected
            first = await conn.receive_json_from(timeout=2)
            assert first["type"] == "table.snapshot"
            await conn.disconnect()

        run_async(body)
        assert User.objects.filter(is_guest=True).count() == 1  # only the one made above


async def _async(factory):
    from asgiref.sync import sync_to_async

    return await sync_to_async(factory)()


@override_settings(GUESTS_ALLOWED=True)
def test_with_guests_allowed_nothing_changes():
    client = Client()
    assert client.get("/api/auth/config/").json()["guests_allowed"] is True
    assert client.post("/api/auth/guest/", {}, content_type="application/json").status_code == 201


class TestSwitchedOff:
    def test_an_open_socket_is_closed_once_staff_switch_the_account_off(self):
        room, a, b = heads_up_room()

        async def body():
            conn = TestWebSocket().connect_as(room, a)
            assert (await conn.connect())[0]
            await conn.receive_json_from(timeout=2)  # the snapshot
            await User.objects.filter(pk=a.pk).aupdate(is_active=False)
            await conn.send_json_to(
                {
                    "protocol_version": 1,
                    "type": "resync.request",
                    "room_id": room.pk,
                    "payload": {"last_version": 0},
                }
            )
            for _ in range(10):  # past audience.updated and the like, to the close
                out = await conn.receive_output(timeout=2)
                if out["type"] == "websocket.close":
                    break
            assert out == {"type": "websocket.close", "code": LOGIN_REQUIRED_CLOSE_CODE}

        run_async(body)


class TestDropEverywhere:
    def test_a_player_who_only_watches_is_dropped_at_once(self):
        from apps.games.actor import drop_player_everywhere

        room, a, b = heads_up_room()

        async def body():
            conn = TestWebSocket().connect_as(room, a)
            assert (await conn.connect())[0]
            await conn.receive_json_from(timeout=2)  # the snapshot; they never send anything
            await drop_player_everywhere(a.pk, LOGIN_REQUIRED_CLOSE_CODE)
            for _ in range(10):
                out = await conn.receive_output(timeout=2)
                if out["type"] == "websocket.close":
                    break
            assert out == {"type": "websocket.close", "code": LOGIN_REQUIRED_CLOSE_CODE}

        run_async(body)


def test_switching_an_account_off_in_admin_drops_it_from_every_table(monkeypatch):
    from types import SimpleNamespace

    from django.contrib.admin.sites import site

    from apps.games import actor

    dropped = []

    async def fake_drop(user_id, code):
        dropped.append((user_id, code))

    monkeypatch.setattr(actor, "drop_player_everywhere", fake_drop)
    friend = member("chi")
    admin = site._registry[User]
    friend.is_active = False
    admin.save_model(None, friend, SimpleNamespace(changed_data=["is_active"]), change=True)
    assert dropped == [(friend.pk, LOGIN_REQUIRED_CLOSE_CODE)]
    friend.first_name = "Chi"  # any other change leaves them be
    admin.save_model(None, friend, SimpleNamespace(changed_data=["first_name"]), change=True)
    assert len(dropped) == 1
