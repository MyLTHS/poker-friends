"""Table actor, WebSocket consumer and B4 REST (ADR-001 "Test B4 phải có").

Async bodies run through ``asgiref.sync.async_to_sync`` so the suite stays plain pytest. Each
test runs its whole async part in one event loop (``run_async``), which also stops the room
actors at the end, in that same loop.
"""

import asyncio
import json
from dataclasses import asdict

import pytest
from asgiref.sync import async_to_sync
from channels.testing import WebsocketCommunicator
from django.db.models import Sum
from django.test import AsyncClient

from apps.games import actor as actor_module
from apps.games.consumers import RoomConsumer
from apps.games.engine.hand import HandEngine
from apps.games.engine.table import TableSession
from apps.games.models import Hand, HandCommand, LedgerEntry, Room, RoomSeat, User

from .helpers import make_deck

pytestmark = [pytest.mark.django_db(transaction=True)]
CHIPS = 200


class FakeSession(dict):
    async def aget(self, key, default=None):
        return self.get(key, default)

    async def aset(self, key, value):
        self[key] = value

    async def asave(self):
        pass


@pytest.fixture(autouse=True)
def _slow_next_hand(monkeypatch):
    # Keep the next hand from starting inside an assertion window; tests that want it lower it.
    monkeypatch.setattr(actor_module.TableActor, "next_hand_delay", 60)
    yield
    actor_module._actors.clear()


def run_async(body) -> None:
    async def wrapper():
        try:
            await body()
        finally:
            await actor_module.reset_registry_for_tests()

    async_to_sync(wrapper)()


def make_room(**kwargs) -> Room:
    defaults = {"name": "T", "small_blind": 1, "big_blind": 2, "think_time_seconds": 30}
    defaults.update(kwargs)
    return Room.objects.create(**defaults)


def make_user(name: str) -> User:
    return User.objects.create_user(username=name)


def seat(room: Room, user: User, n: int, chips: int = CHIPS) -> None:
    RoomSeat.objects.create(room=room, user=user, seat=n)
    LedgerEntry.objects.create(room=room, user=user, kind="grant", amount=chips)


def heads_up_room(**kwargs) -> tuple[Room, User, User]:
    room = make_room(**kwargs)
    a, b = make_user("alice"), make_user("bob")
    seat(room, a, 1)
    seat(room, b, 2)
    return room, a, b


async def connect(room: Room, user: User) -> WebsocketCommunicator:
    communicator = WebsocketCommunicator(RoomConsumer.as_asgi(), f"/ws/rooms/{room.pk}/")
    communicator.scope["url_route"] = {"kwargs": {"room_id": str(room.pk)}}
    communicator.scope["session"] = FakeSession({"games_user_id": user.pk})
    connected, _ = await communicator.connect()
    assert connected
    first = await communicator.receive_json_from(timeout=2)
    assert first["type"] == "table.snapshot"
    return communicator


async def send_act(conn, room: Room, hand_id: int, command_id: str, kind: str, amount=None):
    await conn.send_json_to(
        {
            "protocol_version": 1,
            "type": "command.act",
            "room_id": room.pk,
            "hand_id": hand_id,
            "command_id": command_id,
            "payload": {"kind": kind, "amount": amount},
        }
    )


async def drain(conn, wait: float = 0.3) -> list[dict]:
    # receive_nothing() just peeks; a receive_*() that times out would cancel the consumer.
    messages = []
    while not await conn.receive_nothing(timeout=wait):
        messages.append(await conn.receive_json_from())
    return messages


async def started_hand(*conns) -> tuple[dict, dict[str, list[dict]]]:
    """Drain every connection; return the first hand.started seen and all messages by index."""
    seen = {i: await drain(c) for i, c in enumerate(conns)}
    for messages in seen.values():
        for message in messages:
            if message["type"] == "hand.started":
                return message, seen
    raise AssertionError("no hand.started")


def by_type(messages: list[dict], type_: str) -> list[dict]:
    return [m for m in messages if m["type"] == type_]


class TestTwoAtOnce:
    def test_only_the_player_whose_turn_it_is_gets_applied(self):
        room, a, b = heads_up_room()

        async def body():
            ca, cb = await connect(room, a), await connect(room, b)
            started, _ = await started_hand(ca, cb)
            hand_id = started["hand_id"]
            to_act = started["payload"]["hand"]["actor"]
            waiting = str(b.pk) if to_act == str(a.pk) else str(a.pk)
            actor_conn, waiting_conn = (ca, cb) if to_act == str(a.pk) else (cb, ca)
            table = await actor_module.get_actor(room.pk)

            def call_command(command_id):
                return {
                    "protocol_version": 1,
                    "type": "command.act",
                    "room_id": room.pk,
                    "hand_id": hand_id,
                    "command_id": command_id,
                    "payload": {"kind": "call", "amount": None},
                }

            # Both arrive before the actor handles either. The one who is not to act lands
            # first in the queue, so the outcome cannot depend on who happens to go second.
            waiting_name = next(c for c, p in table.connections.items() if p == waiting)
            actor_name = next(c for c, p in table.connections.items() if p == to_act)
            table._queue.put_nowait(
                actor_module._Command(waiting_name, waiting, call_command("waiting-call"))
            )
            table._queue.put_nowait(
                actor_module._Command(actor_name, to_act, call_command("actor-call-1"))
            )
            waiting_msgs, actor_msgs = await drain(waiting_conn), await drain(actor_conn)

            codes = [m["payload"]["code"] for m in by_type(waiting_msgs, "command.rejected")]
            assert codes == ["not_your_turn"]
            assert by_type(actor_msgs, "command.ack")
            rows = [c async for c in HandCommand.objects.filter(hand_id=hand_id)]
            assert [(str(r.player_id), r.command_id) for r in rows] == [(to_act, "actor-call-1")]

        run_async(body)


class TestIdempotency:
    def test_resending_the_same_command_id_applies_once(self):
        room, a, b = heads_up_room()

        async def body():
            ca, cb = await connect(room, a), await connect(room, b)
            started, _ = await started_hand(ca, cb)
            hand_id = started["hand_id"]
            conn = ca if started["payload"]["hand"]["actor"] == str(a.pk) else cb

            await send_act(conn, room, hand_id, "dup-command", "call")
            first = by_type(await drain(conn), "command.ack")
            await send_act(conn, room, hand_id, "dup-command", "call")
            second = by_type(await drain(conn), "command.ack")

            assert first[0]["payload"]["duplicate"] is False
            assert second[0]["payload"]["duplicate"] is True
            assert second[0]["payload"]["result_version"] == first[0]["payload"]["result_version"]
            assert await HandCommand.objects.filter(hand_id=hand_id).acount() == 1

        run_async(body)

    def test_same_command_id_with_different_content_is_rejected(self):
        room, a, b = heads_up_room()

        async def body():
            ca, cb = await connect(room, a), await connect(room, b)
            started, _ = await started_hand(ca, cb)
            hand_id = started["hand_id"]
            conn = ca if started["payload"]["hand"]["actor"] == str(a.pk) else cb

            await send_act(conn, room, hand_id, "reused-command", "raise", 6)
            await drain(conn)
            await send_act(conn, room, hand_id, "reused-command", "raise", 8)
            rejected = by_type(await drain(conn), "command.rejected")
            assert [m["payload"]["code"] for m in rejected] == ["command_id_reused"]
            assert await HandCommand.objects.filter(hand_id=hand_id).acount() == 1

        run_async(body)


class TestTimeout:
    def test_the_clock_folds_or_checks_for_a_player_who_does_not_act(self):
        room, a, b = heads_up_room(think_time_seconds=1)

        async def body():
            ca, cb = await connect(room, a), await connect(room, b)
            await started_hand(ca, cb)
            await asyncio.sleep(1.3)
            applied = by_type(await drain(ca), "action.applied")
            assert applied and applied[0]["payload"]["action"]["timeout"] is True

        run_async(body)

    @pytest.mark.parametrize("timeout_first", [False, True])
    def test_timeout_and_player_command_at_once_only_one_takes_effect(self, timeout_first):
        room, a, b = heads_up_room()

        async def body():
            ca, cb = await connect(room, a), await connect(room, b)
            started, _ = await started_hand(ca, cb)
            hand_id = started["hand_id"]
            to_act = started["payload"]["hand"]["actor"]
            conn = ca if to_act == str(a.pk) else cb
            table = await actor_module.get_actor(room.pk)
            command = {
                "protocol_version": 1,
                "type": "command.act",
                "room_id": room.pk,
                "hand_id": hand_id,
                "command_id": "racing-command",
                "payload": {"kind": "call", "amount": None},
            }
            # Put both on the queue before the actor runs either: same instant, as in ADR-001.
            timeout = actor_module._Timeout(hand_id, to_act)
            items = [timeout, actor_module._Command("x", to_act, command)]
            for item in items if timeout_first else reversed(items):
                table._queue.put_nowait(item)
            await drain(conn)

            rows = [c async for c in HandCommand.objects.filter(hand_id=hand_id)]
            assert len(rows) == 1
            assert rows[0].kind == ("fold" if timeout_first else "call")

        run_async(body)


class TestProjection:
    def test_nobody_sees_another_players_hole_cards(self):
        room, a, b = heads_up_room()
        watcher = make_user("watcher")

        async def body():
            ca, cb = await connect(room, a), await connect(room, b)
            cw = await connect(room, watcher)
            started, seen = await started_hand(ca, cb)
            hand_id = started["hand_id"]
            for conn, me in ((ca, str(a.pk)), (cb, str(b.pk))):
                hand = (await asyncio.wait_for(_snapshot(conn, room), 2))["hand"]
                for player in hand["players"]:
                    hidden = all(card == "??" for card in player["cards"])
                    assert hidden == (player["player_id"] != me)
            spectator = (await _snapshot(cw, room))["hand"]
            assert spectator["hand_id"] == hand_id
            assert all(c == "??" for p in spectator["players"] for c in p["cards"])

        run_async(body)


class TestTwoTabs:
    def test_two_tabs_of_one_account_share_the_seat_and_its_view(self):
        room, a, b = heads_up_room()

        async def body():
            tab1, tab2 = await connect(room, a), await connect(room, a)
            cb = await connect(room, b)
            await started_hand(tab1, tab2, cb)
            views = [(await _snapshot(tab, room))["hand"] for tab in (tab1, tab2)]
            assert views[0] is not None and views[0] == views[1]
            mine = next(p for p in views[0]["players"] if p["player_id"] == str(a.pk))
            assert "??" not in mine["cards"]

            await tab1.disconnect()
            table = await actor_module.get_actor(room.pk)
            await drain(tab2)
            assert table._occupant(1)["connected"] is True  # the other tab is still there

        run_async(body)


async def _snapshot(conn, room: Room) -> dict:
    await conn.send_json_to(
        {
            "protocol_version": 1,
            "type": "resync.request",
            "room_id": room.pk,
            "payload": {"last_version": 0},
        }
    )
    while True:
        message = await conn.receive_json_from(timeout=2)
        if message["type"] == "table.snapshot":
            return message["payload"]["table"]


class TestCompletedHands:
    def test_a_finished_hand_is_stored_replays_to_its_result_and_keeps_chips(self):
        room, a, b = heads_up_room()

        async def body():
            ca, cb = await connect(room, a), await connect(room, b)
            started, _ = await started_hand(ca, cb)
            hand_id = started["hand_id"]
            conn = ca if started["payload"]["hand"]["actor"] == str(a.pk) else cb

            await send_act(conn, room, hand_id, "fold-command", "fold")
            completed = by_type(await drain(conn), "hand.completed")
            assert completed and completed[0]["hand_id"] == hand_id

            hand = await Hand.objects.aget(pk=hand_id)
            assert hand.completed_at is not None
            records = [c async for c in HandCommand.objects.filter(hand=hand)]
            replayed = HandEngine.replay(
                {
                    "config": hand.config,
                    "actions": [
                        {"player_id": str(c.player_id), "kind": c.kind, "amount": c.amount}
                        for c in records
                    ],
                }
            )
            assert asdict(replayed.result()) == hand.result
            total = await LedgerEntry.objects.filter(room=room).aaggregate(t=Sum("amount"))
            assert total["t"] == 2 * CHIPS

        run_async(body)

    def test_the_next_hand_starts_by_itself_with_the_button_moved(self, monkeypatch):
        monkeypatch.setattr(actor_module.TableActor, "next_hand_delay", 0)
        room, a, b = heads_up_room()

        async def body():
            ca, cb = await connect(room, a), await connect(room, b)
            started, _ = await started_hand(ca, cb)
            conn = ca if started["payload"]["hand"]["actor"] == str(a.pk) else cb
            await send_act(conn, room, started["hand_id"], "fold-command", "fold")
            starts = by_type(await drain(ca), "hand.started")
            assert starts, "a second hand should start after the first one completes"
            second = starts[-1]["payload"]["hand"]
            assert second["hand_no"] == 2
            assert second["button_seat"] != started["payload"]["hand"]["button_seat"]

        run_async(body)


class TestRecovery:
    def test_recovering_mid_hand_replays_and_old_commands_stay_duplicates(self):
        room, a, b = heads_up_room()

        async def body():
            ca, cb = await connect(room, a), await connect(room, b)
            started, _ = await started_hand(ca, cb)
            hand_id = started["hand_id"]
            to_act = started["payload"]["hand"]["actor"]
            user = a if to_act == str(a.pk) else b
            conn = ca if user is a else cb
            await send_act(conn, room, hand_id, "before-crash", "call")
            await drain(conn)
            before = (await actor_module.get_actor(room.pk)).session.current_hand.view_for(None)

            # The process "dies": every actor and connection is gone, the database stays.
            await ca.disconnect()
            await cb.disconnect()
            await actor_module.reset_registry_for_tests()

            recovered = await actor_module.get_actor(room.pk)
            assert recovered.hand.pk == hand_id
            assert recovered.session.current_hand.view_for(None) == before

            again = await connect(room, user)
            await send_act(again, room, hand_id, "before-crash", "call")
            acks = by_type(await drain(again), "command.ack")
            assert acks[0]["payload"]["duplicate"] is True
            assert acks[0]["payload"]["result_version"] is None
            assert await HandCommand.objects.filter(hand_id=hand_id).acount() == 1

        run_async(body)

    def test_a_reused_command_id_is_still_caught_after_a_restart(self):
        room, a, b = heads_up_room()

        async def body():
            ca, cb = await connect(room, a), await connect(room, b)
            started, _ = await started_hand(ca, cb)
            hand_id = started["hand_id"]
            user = a if started["payload"]["hand"]["actor"] == str(a.pk) else b
            await send_act(ca if user is a else cb, room, hand_id, "raise-before", "raise", 6)
            await drain(ca)
            await ca.disconnect()
            await cb.disconnect()
            await actor_module.reset_registry_for_tests()

            again = await connect(room, user)
            await send_act(again, room, hand_id, "raise-before", "raise", 8)
            rejected = by_type(await drain(again), "command.rejected")
            assert [m["payload"]["code"] for m in rejected] == ["command_id_reused"]

        run_async(body)

    def test_hand_finished_but_not_saved_is_settled_exactly_once(self):
        # 7-2 bonus on, and the big blind (bob) holds 7-2 and wins when alice folds: the bonus
        # path must be rebuilt exactly like a live completion.
        room, a, b = heads_up_room(seven_deuce_bonus=50)
        deck = make_deck([str(b.pk), str(a.pk)], holes={str(b.pk): "7h2c", str(a.pk): "AsKd"})
        session = TableSession(1, 2, shuffle=lambda: deck, seven_deuce_bonus=50)
        session.take_seat(str(a.pk), 1)
        session.take_seat(str(b.pk), 2)
        session.grant_chips(str(a.pk), CHIPS)
        session.grant_chips(str(b.pk), CHIPS)
        engine = session.start_hand()
        hand = Hand.objects.create(
            room=room,
            hand_no=1,
            button_seat=engine.config.button_seat,
            config=engine.record()["config"],
        )
        assert engine.actor == str(a.pk)
        # The last command is recorded, then the process dies before save_completed_hand().
        HandCommand.objects.create(
            hand=hand, player=a, sequence=1, command_id="last-command", kind="fold"
        )

        async def body():
            await actor_module.get_actor(room.pk)
            await actor_module.reset_registry_for_tests()
            await actor_module.get_actor(room.pk)  # a second recovery must not add anything

        run_async(body)

        hand.refresh_from_db()
        assert hand.completed_at is not None and hand.result is not None
        rows = LedgerEntry.objects.filter(hand=hand)
        assert sorted((r.user_id, r.kind, r.amount) for r in rows) == sorted(
            [
                (a.pk, "hand", -1),
                (b.pk, "hand", 1),
                (a.pk, "seven_deuce", -50),
                (b.pk, "seven_deuce", 50),
            ]
        )
        assert LedgerEntry.objects.filter(room=room).aggregate(t=Sum("amount"))["t"] == 2 * CHIPS


class TestFailStop:
    def test_an_error_after_the_command_is_recorded_suspends_only_that_room(self):
        room, a, b = heads_up_room()
        other = make_room(name="other")
        seat(other, make_user("x"), 1)
        seat(other, make_user("y"), 2)

        async def body():
            ca, cb = await connect(room, a), await connect(room, b)
            started, _ = await started_hand(ca, cb)
            hand_id = started["hand_id"]
            conn = ca if started["payload"]["hand"]["actor"] == str(a.pk) else cb
            table = await actor_module.get_actor(room.pk)
            other_table = await actor_module.get_actor(other.pk)

            def poisoned(action):
                raise RuntimeError("Chip conservation violated (test)")

            table.session.current_hand.act = poisoned
            await send_act(conn, room, hand_id, "poison-command", "call")
            messages = await drain(conn)
            assert by_type(messages, "room.suspended")
            assert not by_type(messages, "command.ack")
            assert not by_type(messages, "command.rejected")
            assert await HandCommand.objects.filter(hand_id=hand_id).acount() == 1

            await send_act(conn, room, hand_id, "after-suspend", "call")
            codes = [m["payload"]["code"] for m in by_type(await drain(conn), "command.rejected")]
            assert codes == ["room_suspended"]
            assert await HandCommand.objects.filter(hand_id=hand_id).acount() == 1
            assert other_table.suspended is False

        run_async(body)


class TestRest:
    def test_take_seat_snapshot_and_leave_seat(self):
        room = make_room()

        async def body():
            client = AsyncClient()
            response = await client.post(
                f"/api/rooms/{room.pk}/seats/",
                json.dumps({"seat": 3}),
                content_type="application/json",
            )
            assert response.status_code == 201
            occupant = response.json()
            assert occupant["seat"] == 3

            again = await client.post(
                f"/api/rooms/{room.pk}/seats/",
                json.dumps({"seat": 4}),
                content_type="application/json",
            )
            assert again.status_code == 409 and again.json()["code"] == "already_seated"

            snapshot = await client.get(f"/api/rooms/{room.pk}/snapshot/")
            assert snapshot.status_code == 200
            table = snapshot.json()["table"]
            assert table["you"] == {"player_id": occupant["player_id"], "seat": 3}

            left = await client.delete(f"/api/rooms/{room.pk}/seats/me/")
            assert left.status_code == 204
            assert not await RoomSeat.objects.filter(room=room).aexists()

        run_async(body)

    def test_a_taken_seat_and_an_unknown_room_are_refused(self):
        room = make_room()
        seat(room, make_user("owner"), 1)

        async def body():
            client = AsyncClient()
            taken = await client.post(
                f"/api/rooms/{room.pk}/seats/",
                json.dumps({"seat": 1}),
                content_type="application/json",
            )
            assert taken.status_code == 409 and taken.json()["code"] == "seat_taken"
            missing = await client.get("/api/rooms/9999/snapshot/")
            assert missing.status_code == 404 and missing.json()["code"] == "room_not_found"

        run_async(body)
