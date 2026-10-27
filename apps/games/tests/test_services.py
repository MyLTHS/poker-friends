"""Saving a finished hand: the hand row and every ledger entry it caused land together or not
at all, and saving the same hand again changes nothing.
"""

from dataclasses import replace

import pytest
from django.db.models import Sum

from apps.games.engine.table import LedgerKind as EngineLedgerKind
from apps.games.engine.table import TableSession
from apps.games.models import Hand, LedgerEntry, LedgerKind, Room, User
from apps.games.services import HandPersistenceError, save_completed_hand

from .helpers import fold, make_deck, raise_to

pytestmark = pytest.mark.django_db


class Setup:
    """A 2-player room where A (seat 1) bluffs B (seat 2) off the pot holding 7-2."""

    def __init__(self, seven_deuce_bonus: int = 50):
        self.room = Room.objects.create(
            name="Table 1", small_blind=1, big_blind=2, seven_deuce_bonus=seven_deuce_bonus
        )
        self.alice = User.objects.create_user(username="alice")
        self.bob = User.objects.create_user(username="bob")
        self.a, self.b = str(self.alice.pk), str(self.bob.pk)
        self.table = TableSession(small_blind=1, big_blind=2, seven_deuce_bonus=seven_deuce_bonus)
        for seat, (player, user) in enumerate([(self.a, self.alice), (self.b, self.bob)], 1):
            self.table.take_seat(player, seat)
            self.table.grant_chips(player, 100)
            LedgerEntry.objects.create(room=self.room, user=user, kind=LedgerKind.GRANT, amount=100)

    def play_seven_deuce_hand(self):
        # Button is seat 1 (A): player order is (B, A), A acts first and B folds to a raise.
        deck = make_deck(
            [self.b, self.a], holes={self.a: "7h2h", self.b: "AsAd"}, board="7d7c2s9h4c"
        )
        self.table._shuffle = lambda: deck
        hand = self.table.start_hand()
        hand.act(raise_to(hand.actor, 6))
        hand.act(fold(hand.actor))
        self.table.finish_hand()
        entries = [e for e in self.table.ledger if e.hand_no == self.table.hand_no]
        return hand, entries

    def hand_rows(self):
        return LedgerEntry.objects.filter(room=self.room).exclude(kind=LedgerKind.GRANT)

    def room_total(self) -> int:
        return LedgerEntry.objects.filter(room=self.room).aggregate(total=Sum("amount"))["total"]


class TestSaveCompletedHand:
    def test_stores_the_hand_its_result_and_all_its_ledger_entries(self):
        setup = Setup()
        engine, entries = setup.play_seven_deuce_hand()

        hand = save_completed_hand(setup.room, 1, engine, entries)

        assert hand.completed_at is not None
        assert hand.result["net"] == engine.result().net
        rows = {(str(e.user_id), e.kind, e.amount) for e in hand.ledger_entries.all()}
        assert rows == {(e.player_id, e.kind.value, e.amount) for e in entries}
        assert {kind for _, kind, _ in rows} == {LedgerKind.HAND, LedgerKind.SEVEN_DEUCE}
        assert setup.room_total() == 200

    def test_a_failure_halfway_leaves_nothing_of_the_hand(self, monkeypatch):
        setup = Setup()
        engine, entries = setup.play_seven_deuce_hand()
        assert len(entries) >= 2

        original_save = LedgerEntry.save
        saved = []

        def crash_on_second_entry(self, *args, **kwargs):
            if saved:
                raise RuntimeError("server died")
            original_save(self, *args, **kwargs)
            saved.append(self)

        monkeypatch.setattr(LedgerEntry, "save", crash_on_second_entry)

        with pytest.raises(RuntimeError):
            save_completed_hand(setup.room, 1, engine, entries)

        assert len(saved) == 1  # one row really was written before the crash...
        assert not Hand.objects.filter(room=setup.room).exists()  # ...and rolled back
        assert not setup.hand_rows().exists()
        assert setup.room_total() == 200

    def test_saving_the_same_hand_again_writes_nothing_new(self):
        setup = Setup()
        engine, entries = setup.play_seven_deuce_hand()
        first = save_completed_hand(setup.room, 1, engine, entries)
        rows_before = setup.hand_rows().count()

        second = save_completed_hand(setup.room, 1, engine, entries)

        assert second.pk == first.pk
        assert setup.hand_rows().count() == rows_before
        assert setup.room_total() == 200

    def test_finishes_a_hand_row_created_when_the_hand_started(self):
        setup = Setup()
        engine, entries = setup.play_seven_deuce_hand()
        started = Hand.objects.create(
            room=setup.room,
            hand_no=1,
            button_seat=engine.config.button_seat,
            config=engine.record()["config"],
        )

        hand = save_completed_hand(setup.room, 1, engine, entries)

        assert hand.pk == started.pk
        assert hand.completed_at is not None

    def test_entries_that_do_not_sum_to_zero_are_refused(self):
        setup = Setup()
        engine, entries = setup.play_seven_deuce_hand()
        unbalanced = [*entries[:-1], replace(entries[-1], amount=entries[-1].amount + 1)]

        with pytest.raises(HandPersistenceError) as exc:
            save_completed_hand(setup.room, 1, engine, unbalanced)

        assert exc.value.code == "unbalanced_hand"
        assert not Hand.objects.filter(room=setup.room).exists()
        assert not setup.hand_rows().exists()

    def test_hand_entries_must_match_the_engine_result(self):
        setup = Setup()
        engine, entries = setup.play_seven_deuce_hand()
        # Still zero-sum, but the HAND rows now claim a different result than the engine's.
        swapped = [
            replace(e, amount=-e.amount) if e.kind == EngineLedgerKind.HAND else e for e in entries
        ]

        with pytest.raises(HandPersistenceError) as exc:
            save_completed_hand(setup.room, 1, engine, swapped)

        assert exc.value.code == "ledger_does_not_match_result"

    def test_entries_from_another_hand_are_refused(self):
        setup = Setup()
        engine, entries = setup.play_seven_deuce_hand()

        with pytest.raises(HandPersistenceError) as exc:
            save_completed_hand(setup.room, 2, engine, entries)

        assert exc.value.code == "entry_not_for_this_hand"

    def test_a_different_hand_under_the_same_number_is_refused(self):
        setup = Setup()
        engine, entries = setup.play_seven_deuce_hand()
        save_completed_hand(setup.room, 1, engine, entries)
        other_engine, other_entries = setup.play_seven_deuce_hand()  # hand 2, button moved
        relabelled = [replace(e, hand_no=1) for e in other_entries]

        with pytest.raises(HandPersistenceError) as exc:
            save_completed_hand(setup.room, 1, other_engine, relabelled)

        assert exc.value.code == "conflicting_hand"

    def test_an_unfinished_hand_is_refused(self):
        setup = Setup()
        engine = setup.table.start_hand()

        with pytest.raises(HandPersistenceError) as exc:
            save_completed_hand(setup.room, 1, engine, [])

        assert exc.value.code == "hand_not_complete"
