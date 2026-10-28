"""Django-side writes that must happen as one unit.

The engine (``apps/games/engine/``) stays pure Python and only keeps its ledger in memory;
this module moves its results into the database. A finished hand and every ledger entry it
caused are written in a single transaction: if the process dies halfway, none of them exist,
so the chip ledger can never hold half a hand.
"""

from collections.abc import Iterable
from dataclasses import asdict

from django.db import transaction
from django.utils import timezone

from .engine.hand import HandEngine
from .engine.table import LedgerEntry as EngineLedgerEntry
from .engine.table import LedgerKind as EngineLedgerKind
from .models import Hand, LedgerEntry, LedgerKind, Room, User

HAND_RESULT_KINDS = {EngineLedgerKind.HAND, EngineLedgerKind.SEVEN_DEUCE}


class HandPersistenceError(Exception):
    def __init__(self, code: str, message: str = ""):
        super().__init__(message or code)
        self.code = code


def save_completed_hand(
    room: Room, hand_no: int, engine: HandEngine, entries: Iterable[EngineLedgerEntry]
) -> Hand:
    """Store a finished hand, its result and its ledger entries in one transaction.

    ``entries`` are the ``hand`` and ``seven_deuce`` entries ``TableSession.finish_hand()``
    produced for this hand. Calling this again for a hand already stored (a retry after a
    crash, say) returns the stored hand and writes nothing.
    """
    if not engine.is_complete:
        raise HandPersistenceError("hand_not_complete")
    entries = list(entries)
    _check_entries(hand_no, engine, entries)
    config = engine.record()["config"]
    result = asdict(engine.result())

    with transaction.atomic():
        hand, _ = Hand.objects.select_for_update().get_or_create(
            room=room,
            hand_no=hand_no,
            defaults={"button_seat": engine.config.button_seat, "config": config},
        )
        if hand.config != config:
            raise HandPersistenceError("conflicting_hand")
        if hand.completed_at is not None:
            if hand.result != result:
                raise HandPersistenceError("conflicting_hand")
            return hand

        users = _users_by_player_id({e.player_id for e in entries})
        for entry in entries:
            LedgerEntry.objects.create(
                room=room,
                user=users[entry.player_id],
                kind=LedgerKind(entry.kind.value),
                amount=entry.amount,
                hand=hand,
            )
        hand.result = result
        hand.seven_deuce = seven_deuce_award(engine, entries)
        hand.completed_at = timezone.now()
        hand.save(update_fields=["result", "seven_deuce", "completed_at"])
    return hand


def seven_deuce_award(engine: HandEngine, entries: list[EngineLedgerEntry]) -> dict | None:
    """Rule #27 as settled for this hand, or ``None``: the bluffer, the room's bonus at the
    time, and what each other seated player actually paid (never more than the bonus or than
    their chips; someone with nothing left is not listed). Read from the hand's own entries, so
    it always agrees with the ledger.
    """
    winner = engine.seven_deuce_bluff_winner()
    bonus = engine.config.seven_deuce_bonus
    if bonus <= 0 or winner is None:
        return None
    payments = sorted(
        (
            {"player_id": e.player_id, "amount": -e.amount}
            for e in entries
            if e.kind == EngineLedgerKind.SEVEN_DEUCE and e.amount < 0
        ),
        key=lambda payment: int(payment["player_id"]),
    )
    total = sum(payment["amount"] for payment in payments)
    return {"player_id": winner, "bonus": bonus, "payments": payments, "total": total}


def _check_entries(hand_no: int, engine: HandEngine, entries: list[EngineLedgerEntry]) -> None:
    if any(e.hand_no != hand_no or e.kind not in HAND_RESULT_KINDS for e in entries):
        raise HandPersistenceError("entry_not_for_this_hand")
    if sum(e.amount for e in entries) != 0:
        raise HandPersistenceError("unbalanced_hand")
    hand_net: dict[str, int] = {}
    for e in entries:
        if e.kind == EngineLedgerKind.HAND:
            hand_net[e.player_id] = hand_net.get(e.player_id, 0) + e.amount
    expected = {player: delta for player, delta in engine.result().net.items() if delta}
    if hand_net != expected:
        raise HandPersistenceError("ledger_does_not_match_result")


def _users_by_player_id(player_ids: set[str]) -> dict[str, User]:
    """Engine player ids are ``str(user.pk)``."""
    users = {str(user.pk): user for user in User.objects.filter(pk__in=player_ids)}
    if users.keys() != player_ids:
        raise HandPersistenceError("unknown_player")
    return users
