"""The 7-2 award (rule #27) is stored with the hand: who won it, the room's bonus at the time,
and who paid how much. Audit B item done in D; the rule itself is unchanged.
"""

import importlib

import pytest
from django.apps import apps as django_apps

from apps.games.models import Hand, LedgerEntry, LedgerKind
from apps.games.services import save_completed_hand

from .helpers import call, check_down, fold, make_deck, raise_to
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
