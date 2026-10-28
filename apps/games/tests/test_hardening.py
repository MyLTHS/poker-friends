"""Regression tests for the read-only review of B5/B7.

Findings and how each was handled: docs/collab/2026-10-27-claude-review-b5-b7.md.

Each class is one finding; the test failed before the fix.
"""

import asyncio
import json
from types import SimpleNamespace
from unittest.mock import patch

import pytest
from channels.testing import WebsocketCommunicator
from django.core.cache import cache
from django.core.management import CommandError, call_command
from django.test import AsyncClient, Client

from apps.accounts import ratelimit as accounts_ratelimit
from apps.games import actor as actor_module
from apps.games import rooms
from apps.games.consumers import RoomConsumer
from apps.games.models import Hand, Room, RoomSeat
from apps.games.services import HandPersistenceError

from .test_actor import (  # noqa: F401
    _slow_next_hand,
    by_type,
    connect,
    drain,
    heads_up_room,
    make_user,
    run_async,
    send_act,
    started_hand,
)
from .test_durability import unfinished_hand
from .test_rooms import alogged_in, apatch, apost, logged_in, owned_heads_up, owned_one_player

pytestmark = [pytest.mark.django_db(transaction=True)]


@pytest.fixture(autouse=True)
def _fresh_rate_limits(monkeypatch):
    cache.clear()
    monkeypatch.setattr(accounts_ratelimit, "time", SimpleNamespace(time=lambda: 1_800_000_030))


async def socket(room, user, session=None):
    conn = WebsocketCommunicator(RoomConsumer.as_asgi(), f"/ws/rooms/{room.pk}/")
    conn.scope["url_route"] = {"kwargs": {"room_id": str(room.pk)}}
    conn.scope["user"] = user
    conn.scope["session"] = session
    conn.scope["client"] = ("10.0.0.1", 50000)
    return conn


async def close_code(conn) -> int | None:
    while True:
        output = await conn.receive_output(timeout=1)
        if output["type"] == "websocket.close":
            return output.get("code")


class TestKickRace:
    """#1: the ban is checked by the actor, so a request queued just after the kick loses."""

    def test_a_seat_request_queued_after_the_kick_is_refused(self):
        room, owner, a = owned_one_player()
        b = make_user("bob")

        async def body():
            table = await actor_module.get_actor(room.pk)
            kick = asyncio.ensure_future(table.kick(b.pk))
            seat = asyncio.ensure_future(table.take_seat(b, 3))
            results = await asyncio.gather(kick, seat, return_exceptions=True)
            assert results[0] is None
            assert isinstance(results[1], actor_module.Reject) and results[1].code == "kicked"

        run_async(body)
        assert not RoomSeat.objects.filter(room=room, user=b).exists()

    def test_a_connection_queued_after_the_kick_is_not_registered(self):
        room, owner, a = owned_one_player()
        b = make_user("bob")

        async def body():
            table = await actor_module.get_actor(room.pk)
            kick = asyncio.ensure_future(table.kick(b.pk))
            await asyncio.sleep(0)  # the kick is now in the queue
            table.connect("late-conn", "late.channel", str(b.pk), "bob")
            await kick
            await asyncio.sleep(0.05)
            assert "late-conn" not in table.connections

        run_async(body)


class TestBlankName:
    """#2: a name of spaces would break every message that carries RoomInfo."""

    def test_blank_names_are_refused(self):
        client = logged_in(make_user("an"))
        response = client.post(
            "/api/rooms/",
            json.dumps({"name": "   ", "small_blind": 1, "big_blind": 2}),
            content_type="application/json",
        )
        assert response.status_code == 400 and "name" in response.json()["fields"]

        room, owner, a = owned_one_player()

        async def body():
            client = await alogged_in(owner)
            response = await apatch(client, f"/api/rooms/{room.pk}/", {"name": " "})
            assert response.status_code == 400

        run_async(body)
        room.refresh_from_db()
        assert room.name.strip()


class TestPendingSurvivesRestart:
    """#3: changes waiting for the next hand, and a pending close, are stored."""

    def test_changes_and_close_made_during_a_hand_are_stored(self):
        room, owner, a, b = owned_heads_up()

        async def body():
            ca, cb = await connect(room, a), await connect(room, b)
            await started_hand(ca, cb)
            client = await alogged_in(owner)
            await apatch(client, f"/api/rooms/{room.pk}/", {"big_blind": 6})
            assert (await apost(client, f"/api/rooms/{room.pk}/close/")).status_code == 202

        run_async(body)
        room.refresh_from_db()
        assert room.pending_settings == {"big_blind": 6}
        assert room.closing is True
        assert room.big_blind == 2

    def test_a_restart_mid_hand_keeps_them_for_the_end_of_the_hand(self):
        room, a, b = heads_up_room()
        unfinished_hand(room, a, b)
        Room.objects.filter(pk=room.pk).update(pending_settings={"big_blind": 6}, closing=True)

        async def body():
            table = await actor_module.get_actor(room.pk)
            assert table.pending == {"big_blind": 6}
            assert table.closing is True

        run_async(body)

    def test_a_restart_between_hands_applies_them_at_once(self):
        room, a, b = heads_up_room()
        Room.objects.filter(pk=room.pk).update(pending_settings={"big_blind": 6}, closing=True)

        async def body():
            table = await actor_module.get_actor(room.pk)
            await asyncio.sleep(0.05)
            assert table.pending == {} and table.closed

        run_async(body)
        room.refresh_from_db()
        assert (room.big_blind, room.pending_settings, room.closing) == (6, {}, False)
        assert room.status == Room.Status.CLOSED


class TestCloseCodesReachTheBrowser:
    """#4: closing before accept() is an HTTP 403 for a browser; accept first, then close."""

    def test_no_access_is_accept_then_close_4404(self):
        room, owner, a = owned_one_player()
        room.is_private = True
        room.save()
        outsider = make_user("x")

        async def body():
            conn = await socket(room, outsider)
            connected, _ = await conn.connect()
            assert connected is True
            assert await close_code(conn) == 4404

        run_async(body)

    def test_kicked_is_accept_then_close_4403(self):
        room, owner, a = owned_one_player()
        b = make_user("bob")

        async def body():
            client = await alogged_in(owner)
            await apost(client, f"/api/rooms/{room.pk}/kick/", {"player_id": str(b.pk)})
            conn = await socket(room, b)
            connected, _ = await conn.connect()
            assert connected is True
            assert await close_code(conn) == 4403

        run_async(body)


class TestGuestLimit:
    """#5: guests made on the fly count against the same per-IP limit as POST /api/auth/guest/."""

    def test_snapshots_from_fresh_visitors_stop_making_guests(self):
        from apps.accounts.ratelimit import GUESTS_PER_IP

        room, a, b = heads_up_room()

        async def body():
            for _ in range(GUESTS_PER_IP.cap):
                response = await AsyncClient().get(f"/api/rooms/{room.pk}/snapshot/")
                assert response.status_code == 200
            response = await AsyncClient().get(f"/api/rooms/{room.pk}/snapshot/")
            assert response.status_code == 429
            assert response.json()["code"] == "rate_limited"

        run_async(body)

    def test_websockets_from_fresh_visitors_stop_making_guests(self):
        from django.contrib.auth.models import AnonymousUser
        from django.contrib.sessions.backends.db import SessionStore

        from apps.accounts.ratelimit import GUESTS_PER_IP

        room, a, b = heads_up_room()

        async def body():
            for _ in range(GUESTS_PER_IP.cap):
                GUESTS_PER_IP.hit("10.0.0.1")  # this IP already made its guests
            conn = await socket(room, AnonymousUser(), SessionStore())
            connected, _ = await conn.connect()
            assert connected is True
            assert await close_code(conn) == 4429

        run_async(body)


class TestRecoveryWhenSavingFails:
    """#6: a hand that cannot be stored at recovery opens the room suspended, not a 500."""

    def test_the_room_opens_suspended(self):
        room, a, b = heads_up_room()
        unfinished_hand(room, a, b, commands=[(a, "fold")])  # complete, not yet stored

        async def body():
            failing = HandPersistenceError("conflicting_hand")
            with patch.object(actor_module, "asave_completed_hand", side_effect=failing):
                table = await actor_module.get_actor(room.pk)
            assert table.suspended is True

        run_async(body)


class TestSuspendedRoom:
    """#8: a suspended room refuses owner actions and seat changes until it is recovered."""

    def test_grants_and_seats_are_refused(self):
        room, owner, a = owned_one_player()
        b = make_user("bob")
        RoomSeat.objects.create(room=room, user=b, seat=2)
        unfinished_hand(room, a, b, commands=[(b, "check")])  # out of turn: replay fails

        async def body():
            client = await alogged_in(owner)
            grant = await apost(
                client, f"/api/rooms/{room.pk}/chips/", {"player_id": str(a.pk), "amount": 5}
            )
            assert grant.status_code == 409 and grant.json()["code"] == "room_suspended"
            stranger = await alogged_in(owner)
            seat = await apost(stranger, f"/api/rooms/{room.pk}/seats/", {"seat": 5})
            assert seat.status_code == 409 and seat.json()["code"] == "room_suspended"

        run_async(body)

    def test_void_hand_refuses_a_hand_that_replays_fine_unless_forced(self):
        room, a, b = heads_up_room()
        hand = unfinished_hand(room, a, b, commands=[(a, "call")])
        with pytest.raises(CommandError, match="replays fine"):
            call_command("void_hand", str(hand.pk), "--reason", "oops")
        call_command("void_hand", str(hand.pk), "--reason", "server stopped", "--force")
        hand.refresh_from_db()
        assert hand.result["voided"] is True


class TestContractDetails:
    """#9: small mismatches between code and docs/api."""

    def test_post_only_endpoints_refuse_patch(self):
        room, owner, a = owned_one_player()

        async def body():
            client = await alogged_in(owner)
            response = await apatch(client, f"/api/rooms/{room.pk}/close/", {})
            assert response.status_code == 405

        run_async(body)

    def test_player_ids_follow_the_pattern(self):
        room, owner, a = owned_one_player()

        async def body():
            client = await alogged_in(owner)
            for bad in ("007", "١٢", "0"):
                response = await apost(
                    client, f"/api/rooms/{room.pk}/chips/", {"player_id": bad, "amount": 5}
                )
                assert response.status_code == 400, bad

        run_async(body)

    def test_the_lobby_shows_a_room_with_an_unfinished_hand_as_playing(self):
        room, a, b = heads_up_room()
        unfinished_hand(room, a, b)
        lobby = Client().get("/api/rooms/").json()["rooms"]
        assert [r["room"]["status"] for r in lobby] == ["playing"]


class TestMessageRateLimit:
    """#10: resyncs and invalid messages count too, not only commands."""

    def test_resync_spam_is_refused(self):
        room, owner, a = owned_one_player()

        async def body():
            conn = await connect(room, a)
            for _ in range(rooms.COMMANDS_PER_PLAYER.limit + 1):
                await conn.send_json_to(
                    {
                        "protocol_version": 1,
                        "type": "resync.request",
                        "room_id": room.pk,
                        "payload": {"last_version": 0},
                    }
                )
            codes = [m["payload"]["code"] for m in by_type(await drain(conn), "protocol.error")]
            assert codes == ["rate_limited"]

        run_async(body)


class TestSaveErrorDuringPlay:
    """Pre-existing (review note): any error saving a finished hand suspends the room."""

    def test_a_database_error_at_the_end_of_a_hand_suspends_the_room(self):
        room, a, b = heads_up_room()

        async def body():
            ca, cb = await connect(room, a), await connect(room, b)
            started, _ = await started_hand(ca, cb)
            first = a if started["payload"]["hand"]["actor"] == str(a.pk) else b
            conn = ca if first is a else cb
            with patch.object(actor_module, "asave_completed_hand", side_effect=RuntimeError("db")):
                await send_act(conn, room, started["hand_id"], "fold-db-down", "fold")
                messages = await drain(ca)
            assert by_type(messages, "room.suspended")
            assert (await actor_module.get_actor(room.pk)).suspended is True

        run_async(body)
        assert Hand.objects.get(room=room).completed_at is None
