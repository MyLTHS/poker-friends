"""Regression tests for the read-only review of B4a (PR #10): failure paths of the actor.

Each test failed before its fix. See docs/adr/ADR-001-table-actor.md ("Ghi chú khi cài (B4a)").
"""

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
