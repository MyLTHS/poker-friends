"""The 7-2 award (rule #27) is stored with the hand: who won it, the room's bonus at the time,
and who paid how much. Audit B item done in D; the rule itself is unchanged.
"""

import importlib
from dataclasses import asdict

import pytest
from django.apps import apps as django_apps
from django.utils import timezone

from apps.games.models import Hand, HandCommand, LedgerEntry, LedgerKind
from apps.games.services import save_completed_hand

from .helpers import build_hand, call, check_down, fold, make_deck, raise_to
from .test_services import Setup

pytestmark = pytest.mark.django_db


def saved(setup: Setup, engine, entries) -> Hand:
    hand = save_completed_hand(setup.room, setup.table.hand_no, engine, entries)
    hand.refresh_from_db()
    return hand


class TestAwardIsStored:
    def test_a_bluff_with_7_2_stores_the_winner_and_each_payment(self):
        setup = Setup(seven_deuce_bonus=50)
        engine, entries = setup.play_seven_deuce_hand()
        assert saved(setup, engine, entries).seven_deuce == {
            "player_id": setup.a,
            "bonus": 50,
            "payments": [{"player_id": setup.b, "amount": 50}],
            "total": 50,
        }

    def test_a_payer_short_of_the_bonus_is_stored_with_what_they_paid(self):
        setup = Setup(seven_deuce_bonus=500)  # B has 98 left after the blind: pays 98, not 500
        engine, entries = setup.play_seven_deuce_hand()
        award = saved(setup, engine, entries).seven_deuce
        assert award["bonus"] == 500
        assert award["payments"] == [{"player_id": setup.b, "amount": 98}]
        assert award["total"] == 98

    def test_saving_the_same_hand_again_keeps_one_record(self):
        setup = Setup(seven_deuce_bonus=50)
        engine, entries = setup.play_seven_deuce_hand()
        first = saved(setup, engine, entries).seven_deuce
        again = saved(setup, engine, entries).seven_deuce
        assert again == first
        assert LedgerEntry.objects.filter(kind=LedgerKind.SEVEN_DEUCE).count() == 2

    def test_no_award_is_null(self):
        setup = Setup(seven_deuce_bonus=50)
        deck = make_deck([setup.b, setup.a], holes={setup.a: "AhKh", setup.b: "7s2d"})
        setup.table._shuffle = lambda: deck
        engine = setup.table.start_hand()
        engine.act(raise_to(engine.actor, 6))
        engine.act(fold(engine.actor))  # A wins the bluff, but without 7-2
        setup.table.finish_hand()
        entries = [e for e in setup.table.ledger if e.hand_no == setup.table.hand_no]
        assert saved(setup, engine, entries).seven_deuce is None

    def test_7_2_winning_at_showdown_is_no_award(self):
        setup = Setup(seven_deuce_bonus=50)
        deck = make_deck(
            [setup.b, setup.a], holes={setup.a: "7h2h", setup.b: "AsAd"}, board="7d7c2s9h4c"
        )
        setup.table._shuffle = lambda: deck
        engine = setup.table.start_hand()
        engine.act(call(engine.actor))
        check_down(engine)
        setup.table.finish_hand()
        entries = [e for e in setup.table.ledger if e.hand_no == setup.table.hand_no]
        assert saved(setup, engine, entries).seven_deuce is None


class TestOlderHandsAreFilledIn:
    def test_the_migration_rebuilds_the_record_from_the_ledger(self):
        setup = Setup(seven_deuce_bonus=50)
        engine, entries = setup.play_seven_deuce_hand()
        hand = saved(setup, engine, entries)
        Hand.objects.filter(pk=hand.pk).update(seven_deuce=None)  # as stored before this change

        migration = importlib.import_module("apps.games.migrations.0012_hand_seven_deuce")
        migration.fill_in_seven_deuce(django_apps, None)

        hand.refresh_from_db()
        assert hand.seven_deuce == {
            "player_id": setup.a,
            "bonus": 50,
            "payments": [{"player_id": setup.b, "amount": 50}],
            "total": 50,
        }


def stored_hand(setup: Setup, hand_no: int, holes: dict[str, str], bonus: int = 50, voided=False):
    """A finished hand as an old row: A raises, B folds; its commands logged, no ledger entries
    and seven_deuce null (what 0012 left for a bluff nobody paid for)."""
    seats = [(1, setup.a, 100), (2, setup.b, 100)]
    engine = build_hand(seats, button_seat=1, holes=holes, seven_deuce_bonus=bonus)
    engine.act(raise_to(engine.actor, 6))
    engine.act(fold(engine.actor))
    record = engine.record()
    hand = Hand.objects.create(
        room=setup.room,
        hand_no=hand_no,
        button_seat=1,
        config=record["config"],
        result={"voided": True, "reason": "test"} if voided else asdict(engine.result()),
        completed_at=timezone.now(),
    )
    users = {setup.a: setup.alice, setup.b: setup.bob}
    for i, action in enumerate(record["actions"], 1):
        HandCommand.objects.create(
            hand=hand,
            player=users[action["player_id"]],
            sequence=i,
            command_id=f"c{i}",
            kind=action["kind"],
            amount=action["amount"],
        )
    return hand


def run_0013():
    migration = importlib.import_module("apps.games.migrations.0013_hand_seven_deuce_unpaid")
    migration.fill_in_unpaid_seven_deuce(django_apps, None)


class TestUnpaidBluffsAreFilledIn:
    """0013: the same record as new hands for a 7-2 bluff that has no payment rows."""

    SEVEN_DEUCE = {"A": "7h2h", "B": "AsAd"}
    NO_SEVEN_DEUCE = {"A": "AhKh", "B": "7s2d"}

    def holes(self, setup, which):
        return {setup.a: which["A"], setup.b: which["B"]}

    def test_a_7_2_bluff_with_no_payments_gets_the_empty_award(self):
        setup = Setup(seven_deuce_bonus=50)
        hand = stored_hand(setup, 1, self.holes(setup, self.SEVEN_DEUCE))
        run_0013()
        hand.refresh_from_db()
        assert hand.seven_deuce == {"player_id": setup.a, "bonus": 50, "payments": [], "total": 0}

    def test_running_it_again_changes_nothing(self):
        setup = Setup(seven_deuce_bonus=50)
        hand = stored_hand(setup, 1, self.holes(setup, self.SEVEN_DEUCE))
        run_0013()
        run_0013()
        hand.refresh_from_db()
        assert hand.seven_deuce["total"] == 0

    def test_a_bluff_without_7_2_stays_null(self):
        setup = Setup(seven_deuce_bonus=50)
        hand = stored_hand(setup, 1, self.holes(setup, self.NO_SEVEN_DEUCE))
        run_0013()
        hand.refresh_from_db()
        assert hand.seven_deuce is None

    def test_a_hand_from_before_the_bonus_stays_null(self):
        setup = Setup(seven_deuce_bonus=50)
        hand = stored_hand(setup, 1, self.holes(setup, self.SEVEN_DEUCE), bonus=0)
        run_0013()
        hand.refresh_from_db()
        assert hand.seven_deuce is None

    def test_hands_already_recorded_or_with_payment_rows_are_left_alone(self):
        setup = Setup(seven_deuce_bonus=50)
        engine, entries = setup.play_seven_deuce_hand()
        paid = saved(setup, engine, entries)
        before = paid.seven_deuce
        # payment rows 0012 could not read: a person looks at those, not this migration
        odd = stored_hand(setup, 2, self.holes(setup, self.SEVEN_DEUCE))
        LedgerEntry.objects.create(
            room=setup.room, user=setup.bob, kind=LedgerKind.SEVEN_DEUCE, amount=-50, hand=odd
        )
        LedgerEntry.objects.create(
            room=setup.room, user=setup.alice, kind=LedgerKind.SEVEN_DEUCE, amount=50, hand=odd
        )
        run_0013()
        paid.refresh_from_db()
        odd.refresh_from_db()
        assert paid.seven_deuce == before
        assert odd.seven_deuce is None

    def test_voided_and_unfinished_hands_are_left_alone(self):
        setup = Setup(seven_deuce_bonus=50)
        voided = stored_hand(setup, 1, self.holes(setup, self.SEVEN_DEUCE), voided=True)
        unfinished = Hand.objects.create(
            room=setup.room, hand_no=2, button_seat=1, config=voided.config
        )
        run_0013()
        voided.refresh_from_db()
        unfinished.refresh_from_db()
        assert voided.seven_deuce is None
        assert unfinished.seven_deuce is None

    def test_a_hand_that_no_longer_replays_is_skipped_and_the_rest_still_filled(self):
        setup = Setup(seven_deuce_bonus=50)
        broken = stored_hand(setup, 1, self.holes(setup, self.SEVEN_DEUCE))
        Hand.objects.filter(pk=broken.pk).update(config={**broken.config, "deck": ["Xx"]})
        good = stored_hand(setup, 2, self.holes(setup, self.SEVEN_DEUCE))
        run_0013()
        broken.refresh_from_db()
        good.refresh_from_db()
        assert broken.seven_deuce is None
        assert good.seven_deuce["player_id"] == setup.a
