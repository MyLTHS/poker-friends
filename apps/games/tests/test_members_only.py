"""Members only (GUESTS_ALLOWED off, playing from home and production): nobody without a verified
account reaches the rooms, over REST or WebSocket, and no guest is made on the fly."""

import pytest
from channels.testing import WebsocketCommunicator
from django.contrib.auth.models import AnonymousUser
from django.test import AsyncClient, Client, override_settings

from apps.accounts.services import mark_email_verified
from apps.games.consumers import LOGIN_REQUIRED_CLOSE_CODE, RoomConsumer
from apps.games.models import Room, User

from .test_actor import FakeSession, heads_up_room, make_room, run_async
from .test_rooms import alogged_in, apost

pytestmark = [pytest.mark.django_db(transaction=True), pytest.mark.usefixtures("members_only")]


@pytest.fixture
def members_only(settings):
    settings.GUESTS_ALLOWED = False


def member(name="an"):
    user = User.objects.create_user(
        username=name, email=f"{name}@example.com", password="x" * 12, approved=True
    )
    mark_email_verified(user)
    return user


def self_verified(name="la"):
    """What Gmail or Google sign-in produce: a verified email the owner never approved."""
    user = User.objects.create_user(username=name, email=f"{name}@example.com", password="x" * 12)
    mark_email_verified(user)
    return user


def guest(name="khach-1"):
    return User.objects.create_user(username=name, is_guest=True)


def unverified(name="binh"):
    return User.objects.create_user(username=name, email=f"{name}@example.com", password="x" * 12)


class TestRest:
    def test_the_login_screen_says_guests_are_off_and_no_guest_can_be_made(self):
        client = Client()
        assert client.get("/api/auth/config/").json()["guests_allowed"] is False
        response = client.post("/api/auth/guest/", {}, content_type="application/json")
        assert response.status_code == 403
        assert response.json()["code"] == "guests_disabled"
        assert not User.objects.filter(is_guest=True).exists()

    def test_only_a_verified_member_or_staff_sees_the_rooms(self):
        make_room()
        staff = User.objects.create_user(username="admin", is_staff=True)
        for who, expected in (
            (None, 401),
            (guest(), 401),
            (unverified(), 403),
            (self_verified(), 403),
            (member(), 200),
            (staff, 200),
        ):
            client = Client()
            if who is not None:
                client.force_login(who)
            response = client.get("/api/rooms/")
            assert response.status_code == expected, who
            if expected != 200:
                code = "login_required" if expected == 401 else "not_approved"
                assert response.json()["code"] == code

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

    def test_logging_in_and_signing_up_stay_open(self):
        client = Client()
        signup = client.post(
            "/api/auth/signup/",
            {"email": "moi@example.com", "username": "moi", "password": "mat-khau-dai-123"},
            content_type="application/json",
        )
        assert signup.status_code == 201
        login = client.post(
            "/api/auth/login/",
            {"email": "moi@example.com", "password": "mat-khau-dai-123"},
            content_type="application/json",
        )
        assert login.json()["code"] == "email_not_verified"  # the owner has not vouched yet

    def test_a_self_verified_account_cannot_log_in_until_approved(self):
        self_verified("la")
        client = Client()
        body = {"email": "la@example.com", "password": "x" * 12}
        login = client.post("/api/auth/login/", body, content_type="application/json")
        assert login.status_code == 403
        assert login.json()["code"] == "not_approved"
        User.objects.filter(username="la").update(approved=True)
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

    def test_strangers_guests_and_unverified_accounts_are_closed_with_4401(self):
        room, a, b = heads_up_room()
        a.email = "alice@example.com"
        a.approved = True
        a.save()
        mark_email_verified(a)

        async def body():
            strangers = (
                AnonymousUser(),
                await _async(guest),
                await _async(unverified),
                await _async(self_verified),
            )
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


class TestApprovalWithdrawn:
    def test_an_open_socket_is_closed_once_the_owner_withdraws_approval(self):
        room, a, b = heads_up_room()
        a.email = "alice@example.com"
        a.approved = True
        a.save()
        mark_email_verified(a)

        async def body():
            conn = TestWebSocket().connect_as(room, a)
            assert (await conn.connect())[0]
            await conn.receive_json_from(timeout=2)  # the snapshot
            await User.objects.filter(pk=a.pk).aupdate(approved=False)
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


class TestWithdrawalReachesSilentWatchers:
    def test_a_player_who_only_watches_is_dropped_at_once(self):
        from apps.games.actor import drop_player_everywhere

        room, a, b = heads_up_room()
        a.email = "alice@example.com"
        a.approved = True
        a.save()
        mark_email_verified(a)

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

    def test_the_admin_action_withdraws_approval(self):
        friend = member("chi")
        owner = User.objects.create_superuser(
            username="owner", email="o@example.com", password="x" * 12
        )
        client = Client()
        client.force_login(owner)
        response = client.post(
            "/admin/games/user/",
            {"action": "withdraw_approval", "_selected_action": [friend.pk]},
        )
        assert response.status_code == 302
        friend.refresh_from_db()
        assert friend.approved is False


def test_the_backfill_approves_only_a_verified_current_email():
    import importlib

    from allauth.account.models import EmailAddress
    from django.apps import apps as django_apps

    kept = User.objects.create_user(username="kept", email="kept@example.com")
    EmailAddress.objects.create(user=kept, email="kept@example.com", verified=True, primary=True)
    moved = User.objects.create_user(username="moved", email="new@example.com")
    EmailAddress.objects.create(user=moved, email="old@example.com", verified=True, primary=False)
    khach = guest("khach-9")
    migration = importlib.import_module("apps.games.migrations.0014_user_approved")
    migration.approve_verified_accounts(django_apps, None)
    approved = set(User.objects.filter(approved=True).values_list("username", flat=True))
    assert "kept" in approved and "moved" not in approved and khach.username not in approved
