"""One identity for the table (B4a) and for accounts (B6).

Whoever is logged in through Django auth plays as themselves. Someone who is not logged in
becomes a guest and is *logged in* as that guest, so the guest can later upgrade with the same
``User.id`` and keep the seat and chips.
"""

import json

import pytest
from asgiref.sync import sync_to_async
from channels.testing import WebsocketCommunicator
from django.contrib.auth import SESSION_KEY
from django.contrib.auth.models import AnonymousUser
from django.contrib.sessions.backends.db import SessionStore

from apps.games.consumers import RoomConsumer
from apps.games.models import RoomSeat, User

from .test_actor import _slow_next_hand, make_room, make_user, run_async  # noqa: F401

pytestmark = [pytest.mark.django_db(transaction=True)]
PASSWORD = "sau-con-bai-dep"


async def take_seat(client, room, n=1):
    return await client.post(
        f"/api/rooms/{room.pk}/seats/", json.dumps({"seat": n}), content_type="application/json"
    )


class TestRest:
    def test_a_logged_in_member_sits_as_themselves(self):
        from django.test import AsyncClient

        room = make_room()
        member = make_user("an")

        async def body():
            client = AsyncClient()
            await client.aforce_login(member)
            response = await take_seat(client, room)
            assert response.status_code == 201
            assert response.json()["player_id"] == str(member.pk)
            assert await User.objects.acount() == 1

        run_async(body)

    def test_a_visitor_becomes_a_logged_in_guest_who_can_upgrade_and_keep_the_seat(self):
        from django.test import AsyncClient

        room = make_room()

        async def body():
            client = AsyncClient()
            assert (await client.get(f"/api/rooms/{room.pk}/snapshot/")).status_code == 200
            me = (await client.get("/api/auth/me/")).json()
            assert me["is_guest"] is True

            seated = await take_seat(client, room)
            assert seated.json()["player_id"] == str(me["id"])
            assert await User.objects.acount() == 1

            upgraded = await client.post(
                "/api/auth/upgrade/",
                json.dumps({"email": "khach@example.com", "password": PASSWORD}),
                content_type="application/json",
            )
            assert upgraded.status_code == 200
            assert upgraded.json()["id"] == me["id"]
            seat = await RoomSeat.objects.aget(room=room)
            assert seat.user_id == me["id"]
            snapshot = (await client.get(f"/api/rooms/{room.pk}/snapshot/")).json()
            assert snapshot["table"]["you"] == {"player_id": str(me["id"]), "seat": 1}

        run_async(body)


class TestWebSocket:
    async def connect(self, room, user, session):
        communicator = WebsocketCommunicator(RoomConsumer.as_asgi(), f"/ws/rooms/{room.pk}/")
        communicator.scope["url_route"] = {"kwargs": {"room_id": str(room.pk)}}
        communicator.scope["user"] = user
        communicator.scope["session"] = session
        connected, _ = await communicator.connect()
        assert connected
        snapshot = await communicator.receive_json_from(timeout=2)
        await communicator.disconnect()
        return snapshot["payload"]["table"]["you"]["player_id"]

    def test_uses_the_logged_in_user(self):
        room = make_room()
        member = make_user("an")

        async def body():
            player_id = await self.connect(room, member, SessionStore())
            assert player_id == str(member.pk)
            assert await User.objects.acount() == 1

        run_async(body)

    def test_a_visitor_is_logged_in_as_a_new_guest(self):
        room = make_room()
        session = SessionStore()

        async def body():
            player_id = await self.connect(room, AnonymousUser(), session)
            guest = await User.objects.aget(pk=int(player_id))
            assert guest.is_guest is True
            # Saved, so the next HTTP request with this session is the same guest.
            stored = await sync_to_async(SessionStore)(session.session_key)
            assert await stored.aget(SESSION_KEY) == str(guest.pk)

        run_async(body)


@pytest.mark.django_db
def test_demo_room_sessions_log_in_as_the_seated_guests():
    import io
    import re

    from django.core.management import call_command
    from django.test import Client

    out = io.StringIO()
    call_command("create_demo_room", "--name", "Demo id", "--players", "2", stdout=out)
    cookies = re.findall(r"player (\d+) sessionid=(\w+)", out.getvalue())
    assert len(cookies) == 2
    for player_id, session_key in cookies:
        client = Client()
        client.cookies["sessionid"] = session_key
        me = client.get("/api/auth/me/").json()
        assert me["id"] == int(player_id)
        assert me["is_guest"] is True
