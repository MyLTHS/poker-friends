"""Regression tests for the read-only review of B4a (PR #10): failure paths of the actor.

Each test failed before its fix. See docs/adr/ADR-001-table-actor.md ("Ghi chú khi cài (B4a)").
"""

import asyncio

import pytest
from django.db import OperationalError
from django.db.models import Sum

from apps.games import actor as actor_module
from apps.games.engine.table import TableSession
from apps.games.models import Hand, HandCommand, LedgerEntry

from .helpers import make_deck
from .test_actor import (  # noqa: F401
    CHIPS,
    _slow_next_hand,
    by_type,
    connect,
    drain,
    heads_up_room,
    run_async,
    send_act,
    started_hand,
)

pytestmark = [pytest.mark.django_db(transaction=True)]


def act_message(room, hand_id, command_id, kind, amount=None):
    return {
        "protocol_version": 1,
        "type": "command.act",
        "room_id": room.pk,
        "hand_id": hand_id,
        "command_id": command_id,
        "payload": {"kind": kind, "amount": amount},
    }


class TestSaveFailure:
    """Point 1: the ledger in memory must never run ahead of the database."""

    def test_any_error_saving_a_finished_hand_suspends_the_room(self, monkeypatch):
        room, a, b = heads_up_room()

        async def database_down(*args, **kwargs):
            raise OperationalError("database is locked")

        async def body():
            ca, cb = await connect(room, a), await connect(room, b)
            started, _ = await started_hand(ca, cb)
            conn = ca if started["payload"]["hand"]["actor"] == str(a.pk) else cb
            monkeypatch.setattr(actor_module, "asave_completed_hand", database_down)
            monkeypatch.setattr(actor_module.TableActor, "next_hand_delay", 0)
            await send_act(conn, room, started["hand_id"], "fold-0001", "fold")
            messages = await drain(conn)
            assert by_type(messages, "room.suspended")
            assert not by_type(messages, "hand.started")
            assert (await actor_module.get_actor(room.pk)).suspended is True

        run_async(body)
        assert Hand.objects.filter(room=room).count() == 1
        assert not LedgerEntry.objects.filter(room=room, kind="hand").exists()

    def test_recovery_settles_every_unfinished_hand_not_just_the_last(self):
        room, a, b = heads_up_room()
        deck = make_deck([str(b.pk), str(a.pk)], holes={str(b.pk): "7h2c", str(a.pk): "AsKd"})
        session = TableSession(1, 2, shuffle=lambda: deck)
        session.take_seat(str(a.pk), 1)
        session.take_seat(str(b.pk), 2)
        session.grant_chips(str(a.pk), CHIPS)
        session.grant_chips(str(b.pk), CHIPS)
        first = session.start_hand()
        hand1 = Hand.objects.create(
            room=room,
            hand_no=1,
            button_seat=first.config.button_seat,
            config=first.record()["config"],
        )
        HandCommand.objects.create(
            hand=hand1, player=a, sequence=1, command_id="fold-h1", kind="fold"
        )
        first.act(actor_module.Action(str(a.pk), actor_module.ActionKind.FOLD))
        session.finish_hand()
        second = session.start_hand()
        hand2 = Hand.objects.create(
            room=room,
            hand_no=2,
            button_seat=second.config.button_seat,
            config=second.record()["config"],
        )

        async def body():
            table = await actor_module.get_actor(room.pk)
            assert table.hand.pk == hand2.pk
            assert table.suspended is False

        run_async(body)
        hand1.refresh_from_db()
        assert hand1.completed_at is not None
        assert LedgerEntry.objects.filter(hand=hand1).aggregate(t=Sum("amount"))["t"] == 0
        assert LedgerEntry.objects.filter(room=room).aggregate(t=Sum("amount"))["t"] == 2 * CHIPS


class TestClock:
    """Points 2 and 3: a clock only ever acts on the turn it was set for."""

    def test_a_late_timer_does_not_act_on_the_same_players_next_turn(self):
        # Heads-up: the big blind checks to close preflop and is first to act on the flop.
        room, a, b = heads_up_room()

        async def body():
            ca, cb = await connect(room, a), await connect(room, b)
            started, _ = await started_hand(ca, cb)
            hand_id = started["hand_id"]
            sb = started["payload"]["hand"]["actor"]
            await send_act(ca if sb == str(a.pk) else cb, room, hand_id, "sb-call-0001", "call")
            await drain(ca)
            await drain(cb)
            table = await actor_module.get_actor(room.pk)
            bb = table.session.current_hand.actor
            turn = len(table.session.current_hand._actions)
            # The check and the clock of that same turn arrive together, check first.
            check = act_message(room, hand_id, "bb-check-0001", "check")
            table._queue.put_nowait(actor_module._Command("x", bb, check))
            table._queue.put_nowait(actor_module._Timeout(hand_id, bb, turn))
            await drain(ca)
            rows = [r.command_id async for r in HandCommand.objects.filter(hand_id=hand_id)]
            assert rows == ["sb-call-0001", "bb-check-0001"]

        run_async(body)

    def test_a_client_cannot_take_the_command_id_the_clock_will_use(self):
        room, a, b = heads_up_room(think_time_seconds=1)

        async def body():
            ca, cb = await connect(room, a), await connect(room, b)
            started, _ = await started_hand(ca, cb)
            hand_id = started["hand_id"]
            sb = started["payload"]["hand"]["actor"]
            # What the server used to name the clock's command for this turn.
            await send_act(
                ca if sb == str(a.pk) else cb, room, hand_id, f"timeout-{hand_id}-2", "call"
            )
            await drain(ca)
            await asyncio.sleep(1.6)  # the big blind's clock runs out
            rows = [
                (r.command_id, r.kind) async for r in HandCommand.objects.filter(hand_id=hand_id)
            ]
            assert len(rows) == 2
            assert rows[1][0].startswith("timeout:")

        run_async(body)

    def test_a_clock_whose_command_cannot_be_recorded_tries_again(self, monkeypatch):
        from django.db import IntegrityError

        room, a, b = heads_up_room(think_time_seconds=1)
        real_create = HandCommand.objects.acreate
        failures = []

        async def flaky_create(**kwargs):
            if kwargs["command_id"].startswith("timeout:") and not failures:
                failures.append(kwargs["command_id"])
                raise IntegrityError("simulated")
            return await real_create(**kwargs)

        async def body():
            ca, cb = await connect(room, a), await connect(room, b)
            await started_hand(ca, cb)
            monkeypatch.setattr(HandCommand.objects, "acreate", flaky_create)
            monkeypatch.setattr(actor_module, "TIMEOUT_RETRY_SECONDS", 0.2)
            await asyncio.sleep(1.8)
            table = await actor_module.get_actor(room.pk)
            commands = [c async for c in HandCommand.objects.filter(hand=table.hand or 0)]
            assert failures
            assert table.suspended is False
            # The retry recorded the clock's action, so the hand moved on.
            assert any(c.command_id.startswith("timeout:") for c in commands) or table.hand is None

        run_async(body)


class TestAfterTheCommandIsRecorded:
    """Point 4: once a command is in the log, any failure stops the room (ADR-001 mục 5)."""

    def test_an_error_while_announcing_the_action_suspends_the_room(self, monkeypatch):
        room, a, b = heads_up_room()

        async def broken(self, action, timeout):
            raise RuntimeError("broadcast failed (test)")

        async def body():
            ca, cb = await connect(room, a), await connect(room, b)
            started, _ = await started_hand(ca, cb)
            conn = ca if started["payload"]["hand"]["actor"] == str(a.pk) else cb
            monkeypatch.setattr(actor_module.TableActor, "_after_action", broken)
            await send_act(conn, room, started["hand_id"], "call-then-break", "call")
            messages = await drain(conn)
            assert by_type(messages, "room.suspended")
            assert not by_type(messages, "command.ack")
            assert (await actor_module.get_actor(room.pk)).suspended is True

        run_async(body)

    def test_one_full_channel_does_not_stop_the_room(self, monkeypatch):
        from channels.exceptions import ChannelFull

        room, a, b = heads_up_room()

        async def body():
            ca, cb = await connect(room, a), await connect(room, b)
            started, _ = await started_hand(ca, cb)
            table = await actor_module.get_actor(room.pk)
            stuck = next(
                ch for conn, ch in table.channels.items() if table.connections[conn] == str(b.pk)
            )
            layer = actor_module.get_channel_layer()
            real_send = layer.send

            async def send(channel, message):
                if channel == stuck:
                    raise ChannelFull()
                return await real_send(channel, message)

            monkeypatch.setattr(layer, "send", send)
            conn = ca if started["payload"]["hand"]["actor"] == str(a.pk) else cb
            command_id = "call-with-full-channel"
            await send_act(conn, room, started["hand_id"], command_id, "call")
            await asyncio.sleep(0.3)
            assert table.suspended is False
            assert str(b.pk) not in table.connections.values()  # dropped, it can reconnect
            assert await HandCommand.objects.filter(command_id=command_id).aexists()

        run_async(body)


class TestSnapshotWhileDealing:
    """Point 5: a snapshot taken while the new hand is being recorded must not crash."""

    def test_snapshot_between_deal_and_record(self, monkeypatch):
        room, a, b = heads_up_room()
        errors = []
        real_create = Hand.objects.acreate

        async def slow_create(**kwargs):
            try:
                actor_module._actors[room.pk].snapshot_message(str(a.pk))
            except Exception as error:  # noqa: BLE001 - recording what a GET would hit
                errors.append(repr(error))
            return await real_create(**kwargs)

        async def body():
            monkeypatch.setattr(Hand.objects, "acreate", slow_create)
            ca, cb = await connect(room, a), await connect(room, b)
            await started_hand(ca, cb)

        run_async(body)
        assert errors == []


class TestResendAfterCrash:
    """Point 6: resending the last command of a hand settled during recovery is a duplicate."""

    def test_the_resend_gets_a_duplicate_ack(self):
        room, a, b = heads_up_room()

        async def body():
            ca, cb = await connect(room, a), await connect(room, b)
            started, _ = await started_hand(ca, cb)
            hand_id = started["hand_id"]
            user = a if started["payload"]["hand"]["actor"] == str(a.pk) else b
            # Recorded, then the process died before applying it: recovery finishes the hand.
            await HandCommand.objects.acreate(
                hand_id=hand_id, player=user, sequence=1, command_id="last-cmd-01", kind="fold"
            )
            await ca.disconnect()
            await cb.disconnect()
            await actor_module.reset_registry_for_tests()
            again = await connect(room, user)
            await send_act(again, room, hand_id, "last-cmd-01", "fold")
            acks = by_type(await drain(again), "command.ack")
            assert acks and acks[0]["payload"]["duplicate"] is True
            assert acks[0]["payload"]["result_version"] is None
            await send_act(again, room, hand_id, "last-cmd-01", "check")
            codes = [m["payload"]["code"] for m in by_type(await drain(again), "command.rejected")]
            assert codes == ["command_id_reused"]

        run_async(body)


class TestOrigin:
    """Point 7: the WebSocket only accepts pages served from our own hosts."""

    def test_a_foreign_origin_is_refused_and_ours_is_accepted(self):
        from channels.testing import WebsocketCommunicator

        from config.asgi import application

        room, a, b = heads_up_room()

        async def body():
            for origin, expected in (
                (b"http://evil.example", False),
                (b"http://localhost:3000", True),
            ):
                conn = WebsocketCommunicator(
                    application, f"/ws/rooms/{room.pk}/", headers=[(b"origin", origin)]
                )
                connected, _ = await conn.connect()
                assert connected is expected, origin
                if connected:
                    await conn.disconnect()

        run_async(body)


class TestSmallFixes:
    def test_a_seat_conflict_in_the_database_is_a_409_not_a_500(self, monkeypatch):
        from django.db import IntegrityError
        from django.test import AsyncClient

        from apps.games.models import RoomSeat

        room, a, b = heads_up_room()

        async def conflict(*args, **kwargs):
            raise IntegrityError("unique_seat_per_room")

        async def body():
            monkeypatch.setattr(RoomSeat.objects, "aupdate_or_create", conflict)
            response = await AsyncClient().post(
                f"/api/rooms/{room.pk}/seats/", '{"seat": 5}', content_type="application/json"
            )
            assert response.status_code == 409
            assert response.json()["code"] == "seat_taken"

        run_async(body)

    def test_a_new_connection_does_not_skip_the_pause_between_hands(self, monkeypatch):
        room, a, b = heads_up_room()

        async def body():
            ca, cb = await connect(room, a), await connect(room, b)
            started, _ = await started_hand(ca, cb)
            conn = ca if started["payload"]["hand"]["actor"] == str(a.pk) else cb
            await send_act(conn, room, started["hand_id"], "fold-to-end-01", "fold")
            await drain(ca)
            third = await connect(room, a)  # a new tab during the 60 s pause
            assert not by_type(await drain(third), "hand.started")

        run_async(body)


class TestWholeHandThroughTheConsumer:
    def test_no_message_of_a_hand_played_to_showdown_shows_hidden_cards(self):
        from apps.games import contract

        from .test_actor import make_user, seat

        room, a, b = heads_up_room()
        c = make_user("carol")
        seat(room, c, 3)
        watcher = make_user("watcher")

        async def body():
            conns = {str(u.pk): await connect(room, u) for u in (a, b, c, watcher)}
            seen = {pid: [] for pid in conns}
            hand_id = None
            for _ in range(40):  # check or call every turn until the hand ends
                for pid, conn in conns.items():
                    seen[pid] += await drain(conn, wait=0.15)
                messages = seen[str(a.pk)]
                started = by_type(messages, "hand.started")
                if started and hand_id is None:
                    hand_id = started[0]["hand_id"]
                if by_type(messages, "hand.completed"):
                    break
                hands = [m["payload"]["hand"] for m in messages if m["payload"].get("hand")]
                if not hands:
                    continue
                to_act = hands[-1]["actor"]
                if to_act is None:
                    continue
                legal = [m for m in seen[to_act] if m["payload"].get("hand")][-1]["payload"]["hand"]
                kind = "check" if legal["legal_actions"]["can_check"] else "call"
                step = len([m for m in messages if m["type"] == "action.applied"])
                await send_act(conns[to_act], room, hand_id, f"step-{step:03d}-{to_act}", kind)
            assert by_type(seen[str(a.pk)], "hand.completed"), "the hand did not finish"
            for viewer, messages in seen.items():
                for message in messages:
                    assert contract.semantic_errors(message, viewer) == [], message["type"]

        run_async(body)

    def test_two_players_acting_at_the_same_instant(self):
        room, a, b = heads_up_room()

        async def body():
            ca, cb = await connect(room, a), await connect(room, b)
            started, _ = await started_hand(ca, cb)
            hand_id = started["hand_id"]
            await asyncio.gather(
                send_act(ca, room, hand_id, "same-instant-a", "call"),
                send_act(cb, room, hand_id, "same-instant-b", "call"),
            )
            replies = await drain(ca) + await drain(cb)
            acks = by_type(replies, "command.ack")
            rejected = [m["payload"]["code"] for m in by_type(replies, "command.rejected")]
            # Whichever the actor takes first wins; the other is judged against the new state
            # (not_your_turn, or nothing_to_call once the small blind has called).
            assert len(acks) == 1 and len(rejected) == 1
            assert rejected[0] in {"not_your_turn", "nothing_to_call"}
            assert await HandCommand.objects.filter(hand_id=hand_id).acount() == 1

        run_async(body)
