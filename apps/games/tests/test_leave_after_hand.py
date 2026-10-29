"""Leaving a seat during a hand waits for the hand to end (docs/api/openapi.yaml: leaveSeat,
stayInSeat; docs/api/ws-protocol.md, seat.updated).

Between hands, or for someone not dealt into the running hand, DELETE seats/me/ stands the player
up at once (204). In the running hand they play it out: 202, the seat shows leaving: true, and
the table frees it when the hand ends (also after a void or a restart), before any countdown or
next hand. POST seats/me/stay/ takes the leave back.
"""

import uuid
from io import StringIO

import pytest
from django.core.management import call_command
from django.db import DatabaseError
from django.db.models import QuerySet, Sum
from django.test import AsyncClient

from apps.games import actor as actor_module
from apps.games import contract
from apps.games.engine.table import TableSession
from apps.games.models import Hand, LedgerEntry, Room, RoomSeat, User

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
    send_act,
    started_hand,
)
from .test_durability import unfinished_hand
from .test_rooms import TestContract as _Contract  # not collected twice: no Test* name here
from .test_rooms import _fresh_rate_limits, alogged_in, apost  # noqa: F401

pytestmark = [pytest.mark.django_db(transaction=True)]


def seats_me(room: Room) -> str:
    return f"/api/rooms/{room.pk}/seats/me/"


async def leave(user: User, room: Room):
    return await (await alogged_in(user)).delete(seats_me(room))


async def stay(user: User, room: Room):
    return await apost(await alogged_in(user), f"{seats_me(room)}stay/")


async def seats_seen_by(user: User, room: Room) -> dict[str, dict]:
    """The occupants of the REST snapshot, by player id."""
    response = await (await alogged_in(user)).get(f"/api/rooms/{room.pk}/snapshot/")
    return {s["player_id"]: s for s in response.json()["table"]["seats"]}


async def fold_to_the_end(room: Room, conns: dict, hand_id: int) -> None:
    """Whoever is to act folds, until that hand is over."""
    while True:
        table = await actor_module.get_actor(room.pk)
        if table.hand is None or table.hand.pk != hand_id:
            return
        player = table.session.current_hand.actor
        await send_act(conns[player], room, hand_id, uuid.uuid4().hex, "fold")
        assert by_type(await drain(conns[player]), "command.ack"), f"{player} could not fold"


def players_of(started: dict) -> set[str]:
    return {p["player_id"] for p in started["payload"]["hand"]["players"]}


def three_seated_room(**kwargs) -> tuple[Room, User, User, User]:
    room, a, b = heads_up_room(**kwargs)
    c = make_user("carol")
    seat(room, c, 3)
    return room, a, b, c


class TestTableSession:
    def test_a_leaving_player_is_never_dealt_in_nor_counted(self):
        table = TableSession(1, 2)
        for n, player in enumerate("ABC", 1):
            table.take_seat(player, n)
            table.grant_chips(player, 100)
        table.leaving.add("B")
        assert set(table.start_hand().player_order) == {"A", "C"}

        heads_up = TableSession(1, 2)
        for n, player in enumerate("AB", 1):
            heads_up.take_seat(player, n)
            heads_up.grant_chips(player, 100)
        heads_up.leaving.add("B")
        assert heads_up.can_start_hand() is False
        heads_up.stand_up("B")
        assert heads_up.leaving == set()


class TestLeaveAtOnce:
    def test_with_no_hand_running_the_seat_is_free_at_once(self):
        room = make_room()
        a = make_user("alice")

        async def body():
            client = await alogged_in(a)
            taken = await apost(client, f"/api/rooms/{room.pk}/seats/", {"seat": 1})
            assert taken.status_code == 201
            assert contract.matches(taken.json(), "SeatOccupant")
            assert taken.json()["leaving"] is False
            watcher = await connect(room, a)
            await drain(watcher)

            response = await client.delete(seats_me(room))
            assert response.status_code == 204
            assert not await RoomSeat.objects.filter(room=room).aexists()
            updates = by_type(await drain(watcher), "seat.updated")
            assert [u["payload"] for u in updates] == [{"seat": 1, "occupant": None}]

        run_async(body)

    def test_someone_not_dealt_into_the_running_hand_leaves_at_once(self):
        room, a, b = heads_up_room()
        c = make_user("carol")

        async def body():
            await started_hand(await connect(room, a), await connect(room, b))
            client = await alogged_in(c)
            taken = await apost(client, f"/api/rooms/{room.pk}/seats/", {"seat": 3})
            assert taken.status_code == 201
            assert (await client.delete(seats_me(room))).status_code == 204
            assert not await RoomSeat.objects.filter(room=room, user=c).aexists()

        run_async(body)


class TestLeaveAfterTheHand:
    def test_in_the_hand_they_get_202_keep_playing_and_asking_again_changes_nothing(self):
        room, a, b = heads_up_room()

        async def body():
            conns = {str(a.pk): await connect(room, a), str(b.pk): await connect(room, b)}
            started, _ = await started_hand(*conns.values())
            hand_id = started["hand_id"]
            leaver = a if started["payload"]["hand"]["actor"] == str(a.pk) else b  # to act
            other = conns[str(b.pk) if leaver is a else str(a.pk)]

            response = await leave(leaver, room)
            assert response.status_code == 202
            assert response.json() == {"leaving": True}
            _Contract.validate(response.json(), "LeavingAfterHand")
            updates = by_type(await drain(other), "seat.updated")
            assert len(updates) == 1 and updates[0]["hand_id"] == hand_id
            occupant = updates[0]["payload"]["occupant"]
            assert (occupant["player_id"], occupant["leaving"]) == (str(leaver.pk), True)
            assert (await RoomSeat.objects.aget(room=room, user=leaver)).leaving is True
            assert (await seats_seen_by(leaver, room))[str(leaver.pk)]["leaving"] is True

            mine = conns[str(leaver.pk)]
            await send_act(mine, room, hand_id, "call-while-leaving", "call")
            messages = await drain(mine)
            assert by_type(messages, "command.ack")
            applied = by_type(messages, "action.applied")[0]["payload"]["action"]
            assert (applied["player_id"], applied["kind"]) == (str(leaver.pk), "call")

            again = await leave(leaver, room)
            assert (again.status_code, again.json()) == (202, {"leaving": True})
            assert not by_type(await drain(other), "seat.updated")
            assert await RoomSeat.objects.filter(room=room).acount() == 2

        run_async(body)

    def test_the_seat_is_freed_when_the_hand_ends_before_the_next_hand(self, monkeypatch):
        monkeypatch.setattr(actor_module.TableActor, "next_hand_delay", 0)
        room, a, b, c = three_seated_room()
        watching = make_user("watcher")

        async def body():
            watcher = await connect(room, watching)
            conns = {str(u.pk): await connect(room, u) for u in (a, b, c)}
            started, _ = await started_hand(watcher, *conns.values())
            assert players_of(started) == {str(a.pk), str(b.pk), str(c.pk)}
            assert (await leave(b, room)).status_code == 202
            await fold_to_the_end(room, conns, started["hand_id"])

            messages = await drain(watcher)
            steps = [m["type"] for m in messages]
            completed = steps.index("hand.completed")
            freed = next(
                i
                for i, m in enumerate(messages)
                if m["type"] == "seat.updated" and m["payload"] == {"seat": 2, "occupant": None}
            )
            countdown = next(
                i
                for i, m in enumerate(messages)
                if m["type"] == "room.updated" and m["payload"]["room"]["next_hand_at"]
            )
            second = steps.index("hand.started")
            assert completed < freed < countdown < second
            assert messages[freed]["hand_id"] is None
            assert players_of(messages[second]) == {str(a.pk), str(c.pk)}
            assert not await RoomSeat.objects.filter(room=room, user=b).aexists()
            results = messages[completed]["payload"]["results"]
            left_with = next(r["stack"] for r in results if r["player_id"] == str(b.pk))
            # Chips stay in the room, as with any stand up.
            ledger = LedgerEntry.objects.filter(room=room, user=b)
            assert (await ledger.aaggregate(t=Sum("amount")))["t"] == left_with > 0

        run_async(body)

    def test_stay_takes_the_leave_back(self, monkeypatch):
        monkeypatch.setattr(actor_module.TableActor, "next_hand_delay", 0)
        room, a, b = heads_up_room()
        watching = make_user("watcher")

        async def body():
            watcher = await connect(room, watching)
            conns = {str(a.pk): await connect(room, a), str(b.pk): await connect(room, b)}
            started, _ = await started_hand(watcher, *conns.values())
            assert (await leave(b, room)).status_code == 202

            response = await stay(b, room)
            assert response.status_code == 200
            occupant = response.json()
            assert contract.matches(occupant, "SeatOccupant")
            assert (occupant["player_id"], occupant["leaving"]) == (str(b.pk), False)
            updates = by_type(await drain(watcher), "seat.updated")
            assert [u["payload"]["occupant"]["leaving"] for u in updates] == [True, False]
            assert (await RoomSeat.objects.aget(room=room, user=b)).leaving is False

            await fold_to_the_end(room, conns, started["hand_id"])
            messages = await drain(watcher)
            freed = [m for m in by_type(messages, "seat.updated") if not m["payload"]["occupant"]]
            assert not freed
            assert players_of(by_type(messages, "hand.started")[-1]) == {str(a.pk), str(b.pk)}

        run_async(body)

    def test_stay_without_a_leave_changes_nothing(self):
        room = make_room()
        a = make_user("alice")
        seat(room, a, 1)

        async def body():
            watcher = await connect(room, a)
            await drain(watcher)
            response = await stay(a, room)
            assert response.status_code == 200
            assert (response.json()["player_id"], response.json()["leaving"]) == (str(a.pk), False)
            assert not by_type(await drain(watcher), "seat.updated")

        run_async(body)

    def test_stay_needs_a_seat(self):
        room = make_room()
        eve = make_user("eve")

        async def body():
            response = await stay(eve, room)
            assert response.status_code == 409 and response.json()["code"] == "not_seated"
            _Contract.validate(response.json(), "ApiError")
            users = await User.objects.acount()
            anonymous = await apost(AsyncClient(), f"{seats_me(room)}stay/")
            assert anonymous.status_code == 409 and anonymous.json()["code"] == "not_seated"
            assert await User.objects.acount() == users  # no guest made just to be told that

        run_async(body)


class TestVoidAndRestart:
    def test_voiding_the_hand_frees_the_seat(self):
        room, a, b, c = three_seated_room()
        # b acts out of turn: the hand cannot be replayed, the room waits for an admin. b had
        # asked to leave during it.
        hand = unfinished_hand(room, a, b, commands=[(b, "check")])
        RoomSeat.objects.filter(room=room, user=b).update(leaving=True)

        async def suspended():
            table = await actor_module.get_actor(room.pk)
            assert table.suspended is True
            assert (await seats_seen_by(a, room))[str(b.pk)]["leaving"] is True

        run_async(suspended)  # then the server stops
        call_command("void_hand", str(hand.pk), "--reason", "replay refused", stdout=StringIO())

        async def restarted():
            ca, cc = await connect(room, a), await connect(room, c)
            started, _ = await started_hand(ca, cc)
            assert players_of(started) == {str(a.pk), str(c.pk)}
            assert str(b.pk) not in await seats_seen_by(a, room)
            assert not await RoomSeat.objects.filter(room=room, user=b).aexists()

        run_async(restarted)

    def test_a_hand_finished_by_recovery_frees_the_seat(self):
        room, a, b = heads_up_room()
        # a's fold was the last command, then the process died before the hand was saved.
        hand = unfinished_hand(room, a, b, commands=[(a, "fold")])
        RoomSeat.objects.filter(room=room, user=a).update(leaving=True)

        async def body():
            # The actor frees the seat as it starts, before it handles this connection.
            await connect(room, b)
            assert not await RoomSeat.objects.filter(room=room, user=a).aexists()
            table = await actor_module.get_actor(room.pk)
            seats = table.snapshot_message(str(b.pk))["payload"]["table"]["seats"]
            assert [s["player_id"] for s in seats] == [str(b.pk)]

        run_async(body)
        hand.refresh_from_db()
        assert hand.completed_at is not None

    def test_a_restart_mid_hand_keeps_the_leave_and_frees_the_seat_when_it_ends(self, monkeypatch):
        monkeypatch.setattr(actor_module.TableActor, "next_hand_delay", 0)
        room, a, b, c = three_seated_room()
        watching = make_user("watcher")

        async def body():
            conns = {str(u.pk): await connect(room, u) for u in (a, b, c)}
            started, _ = await started_hand(*conns.values())
            hand_id = started["hand_id"]
            assert (await leave(b, room)).status_code == 202
            for conn in conns.values():
                await conn.disconnect()
            await actor_module.reset_registry_for_tests()  # the server restarts

            seats = await seats_seen_by(a, room)
            assert (seats[str(b.pk)]["leaving"], seats[str(a.pk)]["leaving"]) == (True, False)
            assert (await actor_module.get_actor(room.pk)).hand.pk == hand_id
            watcher = await connect(room, watching)
            conns = {str(u.pk): await connect(room, u) for u in (a, b, c)}
            await fold_to_the_end(room, conns, hand_id)

            messages = await drain(watcher)
            assert {"seat": 2, "occupant": None} in [
                m["payload"] for m in by_type(messages, "seat.updated")
            ]
            assert players_of(by_type(messages, "hand.started")[-1]) == {str(a.pk), str(c.pk)}
            assert not await RoomSeat.objects.filter(room=room, user=b).aexists()

        run_async(body)
        assert Hand.objects.get(room=room, hand_no=1).completed_at is not None


class TestNeverDealtWhileLeaving:
    def test_one_player_and_one_leaving_player_get_no_countdown(self, monkeypatch):
        # Freeing the seat fails (the database is away for a moment): b stays seated, still
        # leaving. Alone with a, b must neither be dealt in nor make a countdown start.
        monkeypatch.setattr(actor_module.TableActor, "next_hand_delay", 0.2)
        room, a, b = heads_up_room()
        broken = {"on": True}
        real_adelete = QuerySet.adelete

        async def adelete(self):
            if broken["on"] and self.model is RoomSeat:
                raise DatabaseError("the database went away")
            return await real_adelete(self)

        monkeypatch.setattr(QuerySet, "adelete", adelete)
        watching = make_user("watcher")

        async def body():
            watcher = await connect(room, watching)
            conns = {str(a.pk): await connect(room, a), str(b.pk): await connect(room, b)}
            started, _ = await started_hand(watcher, *conns.values())
            assert (await leave(b, room)).status_code == 202
            await fold_to_the_end(room, conns, started["hand_id"])
            assert (await seats_seen_by(a, room))[str(b.pk)]["leaving"] is True

            messages = await drain(watcher, wait=0.6)  # the pause after the hand runs out
            assert by_type(messages, "hand.completed")
            assert not by_type(messages, "hand.started")
            assert by_type(messages, "room.updated")[-1]["payload"]["room"]["next_hand_at"] is None
            again = await connect(room, a)  # someone (re)connecting starts no countdown either
            assert not by_type(await drain(again, wait=0.4), "room.updated")
            assert not by_type(await drain(watcher), "room.updated")

            broken["on"] = False
            assert (await leave(b, room)).status_code == 204  # in no hand now: at once
            assert not await RoomSeat.objects.filter(room=room, user=b).aexists()

        run_async(body)
