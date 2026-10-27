"""B5: the clock after a restart, a hand whose replay fails, and voiding such a hand.

ADR-001 mục 4.5 and 5.4 left these to B5.
"""

import asyncio
from datetime import timedelta

import pytest
from django.core.management import CommandError, call_command
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
)

pytestmark = [pytest.mark.django_db(transaction=True)]
THINK = 30


def unfinished_hand(room, a, b, commands=()):
    """A hand stored as if the process died mid-hand. ``a`` acts first (small blind)."""
    deck = make_deck([str(b.pk), str(a.pk)], holes={str(b.pk): "7h2c", str(a.pk): "AsKd"})
    session = TableSession(1, 2, shuffle=lambda: deck, seven_deuce_bonus=room.seven_deuce_bonus)
    session.take_seat(str(a.pk), 1)
    session.take_seat(str(b.pk), 2)
    session.grant_chips(str(a.pk), CHIPS)
    session.grant_chips(str(b.pk), CHIPS)
    engine = session.start_hand()
    assert engine.actor == str(a.pk)
    hand = Hand.objects.create(
        room=room,
        hand_no=1,
        button_seat=engine.config.button_seat,
        config=engine.record()["config"],
    )
    for sequence, (player, kind) in enumerate(commands, start=1):
        HandCommand.objects.create(
            hand=hand, player=player, sequence=sequence, command_id=f"c{sequence}", kind=kind
        )
    return hand


def frozen_now(monkeypatch, at):
    monkeypatch.setattr(actor_module.timezone, "now", lambda: at)


async def recovered_deadline(room):
    table = await actor_module.get_actor(room.pk)
    await asyncio.sleep(0.05)  # the actor schedules the turn from its own task
    return table._deadline


class TestClockAfterRestart:
    def test_the_player_to_act_keeps_only_the_time_that_was_left(self, monkeypatch):
        room, a, b = heads_up_room(think_time_seconds=THINK)
        hand = unfinished_hand(room, a, b, commands=[(a, "call")])
        last = HandCommand.objects.get(hand=hand).created_at
        frozen_now(monkeypatch, last + timedelta(seconds=12))

        async def body():
            assert await recovered_deadline(room) == last + timedelta(seconds=THINK)

        run_async(body)

    def test_with_no_command_yet_the_clock_counts_from_the_deal(self, monkeypatch):
        room, a, b = heads_up_room(think_time_seconds=THINK)
        hand = unfinished_hand(room, a, b)
        frozen_now(monkeypatch, hand.created_at + timedelta(seconds=5))

        async def body():
            assert await recovered_deadline(room) == hand.created_at + timedelta(seconds=THINK)

        run_async(body)

    def test_after_a_long_outage_the_player_still_gets_a_short_grace(self, monkeypatch):
        room, a, b = heads_up_room(think_time_seconds=THINK)
        hand = unfinished_hand(room, a, b, commands=[(a, "call")])
        now = HandCommand.objects.get(hand=hand).created_at + timedelta(minutes=5)
        frozen_now(monkeypatch, now)

        async def body():
            deadline = await recovered_deadline(room)
            assert deadline == now + timedelta(seconds=actor_module.RECOVERY_GRACE_SECONDS)

        run_async(body)

    def test_the_grace_never_exceeds_the_rooms_think_time(self, monkeypatch):
        room, a, b = heads_up_room(think_time_seconds=5)
        hand = unfinished_hand(room, a, b, commands=[(a, "call")])
        now = HandCommand.objects.get(hand=hand).created_at + timedelta(minutes=5)
        frozen_now(monkeypatch, now)

        async def body():
            assert await recovered_deadline(room) == now + timedelta(seconds=5)

        run_async(body)


class TestPoisonedHand:
    """A recorded command the engine refuses on replay: the room opens suspended, not broken."""

    def test_the_room_opens_suspended_and_refuses_commands(self):
        room, a, b = heads_up_room()
        # b acts out of turn: the engine refuses it on replay.
        hand = unfinished_hand(room, a, b, commands=[(b, "check")])

        async def body():
            conn = await connect(room, a)  # connect() asserts the first message is a snapshot
            table = await actor_module.get_actor(room.pk)
            assert table.suspended is True
            snapshot = table.snapshot_message(str(a.pk))
            assert snapshot["payload"]["table"]["room"]["status"] == "suspended"

            await send_act(conn, room, hand.pk, "after-suspend", "call")
            codes = [m["payload"]["code"] for m in by_type(await drain(conn), "command.rejected")]
            assert codes == ["room_suspended"]
            assert not by_type(await drain(conn), "hand.started")
            assert await Hand.objects.filter(room=room).acount() == 1

        run_async(body)

    def test_voiding_the_hand_then_restarting_resumes_play_with_chips_as_before(self, monkeypatch):
        room, a, b = heads_up_room()
        hand = unfinished_hand(room, a, b, commands=[(a, "call"), (a, "check")])
        before = LedgerEntry.objects.filter(room=room).aggregate(t=Sum("amount"))["t"]

        call_command("void_hand", str(hand.pk), "--reason", "replay refused command 2")

        hand.refresh_from_db()
        assert hand.completed_at is not None
        assert hand.result == {"voided": True, "reason": "replay refused command 2"}
        assert not LedgerEntry.objects.filter(hand=hand).exists()
        assert HandCommand.objects.filter(hand=hand).count() == 2  # the log stays as it was

        async def body():
            table = await actor_module.get_actor(room.pk)
            assert table.suspended is False
            assert table.hand is None
            ca, cb = await connect(room, a), await connect(room, b)
            started = by_type(await drain(ca), "hand.started")
            await drain(cb)
            assert started and started[0]["payload"]["hand"]["hand_no"] == 2

        monkeypatch.setattr(actor_module.TableActor, "next_hand_delay", 0)
        run_async(body)
        assert LedgerEntry.objects.filter(room=room).aggregate(t=Sum("amount"))["t"] == before

    def test_only_an_unfinished_hand_can_be_voided(self):
        room, a, b = heads_up_room()
        hand = unfinished_hand(room, a, b)
        call_command("void_hand", str(hand.pk), "--reason", "x", "--force")
        with pytest.raises(CommandError, match="already finished"):
            call_command("void_hand", str(hand.pk), "--reason", "x", "--force")
        with pytest.raises(CommandError, match="No hand"):
            call_command("void_hand", "999999", "--reason", "x")
