"""A seated player gone too long stands up, so a room everyone left closes itself.

(docs/api/ws-protocol.md, "Người ngồi mất kết nối".) A seated player with no connection to the
table for ROOM_AWAY_STAND_SECONDS (5 minutes) stands up as if they had pressed "Đứng dậy": between
hands at once, in a hand when it ends (leaving: true until then). Their chips stay theirs in the
room. Coming back in time keeps the seat (and takes back a leave the server set). Once nobody is
seated the idle close (test_room_autoclose) does the rest. A room whose actor is not loaded has
nobody connected: the sweep stands its players up once the process has served that long.
Tests shorten the time through TableActor.away_stand.
"""

import asyncio
from datetime import timedelta

import pytest
from django.db.models import Sum
from django.utils import timezone

from apps.games import actor as actor_module
from apps.games.models import LedgerEntry, Room, RoomSeat

from .test_actor import (  # noqa: F401
    _slow_next_hand,
    by_type,
    connect,
    drain,
    heads_up_room,
    make_room,
    make_user,
    run_async,
    seat,
    started_hand,
)
from .test_durability import unfinished_hand
from .test_leave_after_hand import leave
from .test_rooms import _fresh_rate_limits, owned_one_player  # noqa: F401

pytestmark = [pytest.mark.django_db(transaction=True)]


def away(monkeypatch, seconds: float | None) -> None:
    monkeypatch.setattr(actor_module.TableActor, "away_stand", seconds)


def idle(monkeypatch, seconds: float | None) -> None:
    monkeypatch.setattr(actor_module.TableActor, "idle_close", seconds)


def balance(room, user) -> int:
    return LedgerEntry.objects.filter(room=room, user=user).aggregate(t=Sum("amount"))["t"] or 0


def occupants(messages: list[dict]) -> list[dict | None]:
    return [m["payload"]["occupant"] for m in by_type(messages, "seat.updated")]


async def seated(room, user) -> bool:
    return await RoomSeat.objects.filter(room=room, user=user).aexists()


class TestAwayBetweenHands:
    def test_gone_for_the_away_time_they_stand_up_and_keep_their_chips(self, monkeypatch):
        away(monkeypatch, 1.0)
        room, owner, a = owned_one_player()
        chips = balance(room, a)

        async def body():
            watcher = await connect(room, owner)
            player = await connect(room, a)
            await drain(watcher)
            await player.disconnect()
            gone = await drain(watcher, wait=0.2)
            assert occupants(gone)[-1]["connected"] is False  # still seated, shown as away
            assert await seated(room, a)
            later = await drain(watcher, wait=1.2)
            assert occupants(later)[-1] is None  # stood up
            assert not await seated(room, a)
            # nobody seated now: the idle close counts down
            assert by_type(later, "room.updated")[-1]["payload"]["room"]["closes_at"] is not None

        run_async(body)
        assert balance(room, a) == chips  # their chips stay theirs in the room
        assert Room.objects.get(pk=room.pk).empty_since is not None

    def test_coming_back_in_time_keeps_the_seat(self, monkeypatch):
        away(monkeypatch, 0.4)
        room, owner, a = owned_one_player()

        async def body():
            await (await connect(room, a)).disconnect()
            await asyncio.sleep(0.1)
            back = await connect(room, a)
            await drain(back, wait=0.6)
            assert await seated(room, a)
            table = await actor_module.get_actor(room.pk)
            assert table._room_info()["closes_at"] is None

        run_async(body)

    def test_a_second_tab_still_open_keeps_the_seat(self, monkeypatch):
        away(monkeypatch, 0.2)
        room, owner, a = owned_one_player()

        async def body():
            first = await connect(room, a)
            second = await connect(room, a)
            await first.disconnect()
            await drain(second, wait=0.5)
            assert await seated(room, a)

        run_async(body)

    def test_a_socket_dropped_for_being_slow_counts_as_gone(self, monkeypatch):
        away(monkeypatch, 0.2)
        room, owner, a = owned_one_player()

        async def body():
            await connect(room, a)
            table = await actor_module.get_actor(room.pk)
            [conn] = [c for c, p in table.connections.items() if p == str(a.pk)]
            table._drop_full(conn)  # its own disconnect will not find it any more
            await asyncio.sleep(0.5)
            assert not await seated(room, a)

        run_async(body)

    def test_then_the_empty_room_closes_itself(self, monkeypatch):
        away(monkeypatch, 0.2)
        idle(monkeypatch, 0.3)
        room, owner, a = owned_one_player()

        async def body():
            watcher = await connect(room, owner)  # a spectator: keeps nothing open
            await (await connect(room, a)).disconnect()
            messages = await drain(watcher, wait=1.0)
            rooms = by_type(messages, "room.updated")
            assert rooms[-1]["payload"]["room"]["status"] == "closed"

        run_async(body)
        assert Room.objects.get(pk=room.pk).status == Room.Status.CLOSED

    def test_never_connected_after_a_restart_they_stand_up_too(self, monkeypatch):
        away(monkeypatch, 0.2)
        room, owner, a = owned_one_player()

        async def body():
            await actor_module.get_actor(room.pk)  # loaded (an owner's REST call), nobody here
            await asyncio.sleep(0.4)
            assert not await seated(room, a)

        run_async(body)

    def test_the_real_time_is_five_minutes(self):
        assert actor_module.ROOM_AWAY_STAND_SECONDS == 300
        assert actor_module.away_stand_seconds() == 300


class TestAwayInAHand:
    def test_they_play_the_hand_out_then_stand_up(self, monkeypatch):
        away(monkeypatch, 0.2)
        room, a, b = heads_up_room(think_time_seconds=2)

        async def body():
            ca, cb = await connect(room, a), await connect(room, b)
            started, _ = await started_hand(ca, cb)
            await ca.disconnect()
            await asyncio.sleep(0.4)
            row = await RoomSeat.objects.aget(room=room, user=a)
            assert row.leaving is True  # in the hand: they go when it ends
            # alice's clock folds her for her; the hand ends and her seat is freed
            seen = await drain(cb, wait=3.0)
            assert by_type(seen, "hand.completed")
            assert not await seated(room, a)
            assert await seated(room, b)

        run_async(body)

    def test_coming_back_before_the_end_takes_the_leave_back(self, monkeypatch):
        away(monkeypatch, 0.2)
        room, a, b = heads_up_room()

        async def body():
            ca, cb = await connect(room, a), await connect(room, b)
            await started_hand(ca, cb)
            await ca.disconnect()
            await asyncio.sleep(0.4)
            assert (await RoomSeat.objects.aget(room=room, user=a)).leaving is True
            back = await connect(room, a)
            await drain(back)
            assert (await RoomSeat.objects.aget(room=room, user=a)).leaving is False

        run_async(body)

    def test_asking_to_leave_while_gone_makes_the_leave_theirs(self, monkeypatch):
        away(monkeypatch, 0.2)
        room, a, b = heads_up_room()

        async def body():
            ca, cb = await connect(room, a), await connect(room, b)
            await started_hand(ca, cb)
            await ca.disconnect()
            await asyncio.sleep(0.4)  # the server's leave
            assert (await leave(a, room)).status_code == 202  # then their own, from the lobby
            back = await connect(room, a)
            await drain(back)
            assert (await RoomSeat.objects.aget(room=room, user=a)).leaving is True

        run_async(body)

    def test_a_leave_they_asked_for_themselves_is_not_taken_back(self, monkeypatch):
        away(monkeypatch, 0.2)
        room, a, b = heads_up_room()

        async def body():
            ca, cb = await connect(room, a), await connect(room, b)
            await started_hand(ca, cb)
            assert (await leave(a, room)).status_code == 202
            await ca.disconnect()
            await asyncio.sleep(0.4)
            back = await connect(room, a)
            await drain(back)
            assert (await RoomSeat.objects.aget(room=room, user=a)).leaving is True

        run_async(body)


class TestSweepUnloadedRooms:
    def served_since(self, monkeypatch, seconds_ago: float) -> None:
        monkeypatch.setattr(
            actor_module, "_serving_since", timezone.now() - timedelta(seconds=seconds_ago)
        )

    def test_players_of_a_room_nobody_opened_since_the_start_stand_up(self, monkeypatch):
        away(monkeypatch, 60)
        self.served_since(monkeypatch, 61)
        room = make_room()
        a, b = make_user("alice"), make_user("bob")
        seat(room, a, 1)
        seat(room, b, 2)
        chips = balance(room, a)

        async def body():
            await actor_module.sweep_idle_rooms()
            assert room.pk not in actor_module._actors  # no actor loaded for it

        run_async(body)
        assert not RoomSeat.objects.filter(room=room).exists()
        assert balance(room, a) == chips
        room.refresh_from_db()
        assert room.status == Room.Status.OPEN  # the idle close comes 5 minutes later
        assert timezone.now() - room.empty_since < timedelta(seconds=5)

    def test_not_before_the_process_has_served_the_away_time(self, monkeypatch):
        away(monkeypatch, 60)
        self.served_since(monkeypatch, 10)
        room, a = make_room(), make_user("alice")
        seat(room, a, 1)

        run_async(actor_module.sweep_idle_rooms)
        assert RoomSeat.objects.filter(room=room).exists()

    def test_not_before_the_sweep_has_started(self, monkeypatch):
        away(monkeypatch, 0)
        monkeypatch.setattr(actor_module, "_serving_since", None)
        room, a = make_room(), make_user("alice")
        seat(room, a, 1)

        run_async(actor_module.sweep_idle_rooms)
        assert RoomSeat.objects.filter(room=room).exists()

    def test_a_loaded_room_or_an_unfinished_hand_is_left_to_its_actor(self, monkeypatch):
        away(monkeypatch, 60)
        self.served_since(monkeypatch, 61)
        loaded, a = make_room(), make_user("lena")
        seat(loaded, a, 1)
        mid_hand, b, c = heads_up_room()
        unfinished_hand(mid_hand, b, c)
        closed, d = make_room(status=Room.Status.CLOSED), make_user("dan")
        seat(closed, d, 1)

        async def body():
            await actor_module.get_actor(loaded.pk)
            await actor_module.sweep_idle_rooms()

        run_async(body)
        assert RoomSeat.objects.filter(room=loaded).exists()
        assert RoomSeat.objects.filter(room=mid_hand).count() == 2
        assert RoomSeat.objects.filter(room=closed).exists()
