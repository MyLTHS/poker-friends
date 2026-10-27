import random

import pytest

from apps.games.engine.cards import shuffled_deck
from apps.games.engine.table import LedgerKind, TableError, TableSession

from .helpers import call, check_down, fold, make_deck, raise_to


def make_table(**kwargs) -> TableSession:
    rng = random.Random(1)
    return TableSession(small_blind=1, big_blind=2, shuffle=lambda: shuffled_deck(rng), **kwargs)


def seated_table(*players: str, chips: int = 100) -> TableSession:
    table = make_table()
    for seat, player in enumerate(players, start=1):
        table.take_seat(player, seat)
        table.grant_chips(player, chips)
    return table


def finish_by_folding(table: TableSession) -> None:
    hand = table.current_hand
    while not hand.is_complete:
        hand.act(fold(hand.actor))
    table.finish_hand()


class TestSeating:
    def test_cannot_take_an_occupied_seat(self):
        table = seated_table("A")
        with pytest.raises(TableError) as exc:
            table.take_seat("B", 1)
        assert exc.value.code == "seat_taken"

    def test_cannot_sit_twice(self):
        table = seated_table("A")
        with pytest.raises(TableError) as exc:
            table.take_seat("A", 2)
        assert exc.value.code == "already_seated"

    @pytest.mark.parametrize("seat", [0, 10])
    def test_seat_must_exist(self, seat):
        with pytest.raises(TableError) as exc:
            make_table().take_seat("A", seat)
        assert exc.value.code == "invalid_seat"

    def test_need_two_players_with_chips_to_start(self):
        table = seated_table("A")
        table.take_seat("B", 2)  # no chips
        with pytest.raises(TableError) as exc:
            table.start_hand()
        assert exc.value.code == "not_enough_players"


class TestHands:
    def test_button_rotates_between_hands(self):
        table = seated_table("A", "B", "C")
        buttons = []
        for _ in range(4):
            table.start_hand()
            buttons.append(table.current_hand.config.button_seat)
            finish_by_folding(table)
        assert buttons == [1, 2, 3, 1]

    def test_cannot_start_a_hand_while_one_is_running(self):
        table = seated_table("A", "B")
        table.start_hand()
        with pytest.raises(TableError) as exc:
            table.start_hand()
        assert exc.value.code == "hand_in_progress"

    def test_finish_hand_applies_results_to_room_stacks(self):
        table = seated_table("A", "B")
        hand = table.start_hand()
        hand.act(fold(hand.actor))
        table.finish_hand()
        assert sorted(table.stacks.values()) == [99, 101]

    def test_cannot_finish_an_incomplete_hand(self):
        table = seated_table("A", "B")
        table.start_hand()
        with pytest.raises(TableError) as exc:
            table.finish_hand()
        assert exc.value.code == "hand_not_complete"

    def test_sitting_out_player_is_skipped_next_hand(self):
        table = seated_table("A", "B", "C")
        table.sit_out("B")
        hand = table.start_hand()
        assert set(hand.player_order) == {"A", "C"}
        finish_by_folding(table)
        table.sit_in("B")
        assert set(table.start_hand().player_order) == {"A", "B", "C"}

    def test_busted_player_is_not_dealt_in(self):
        table = seated_table("A", "B", "C", chips=10)
        hand = table.start_hand()
        # Everyone all-in; someone (or a split) busts at least one player.
        while not hand.is_complete:
            legal = hand.legal_actions(hand.actor)
            if legal.max_raise_to is not None:
                hand.act(raise_to(hand.actor, legal.max_raise_to))
            else:
                hand.act(call(hand.actor))
        table.finish_hand()
        busted = {p for p, s in table.stacks.items() if s == 0}
        if len(busted) < 2:
            next_hand = table.start_hand()
            assert busted.isdisjoint(next_hand.player_order)


class TestChipsAndLedger:
    def test_grant_adds_ledger_entry(self):
        table = seated_table("A")
        assert table.ledger[-1].kind == LedgerKind.GRANT
        assert table.ledger[-1].amount == 100
        assert table.stacks["A"] == 100

    def test_cannot_grant_to_player_in_current_hand(self):
        table = seated_table("A", "B")
        table.start_hand()
        with pytest.raises(TableError) as exc:
            table.grant_chips("A", 50)
        assert exc.value.code == "player_in_hand"

    def test_can_grant_to_player_not_in_current_hand(self):
        table = seated_table("A", "B")
        table.take_seat("C", 3)
        table.start_hand()
        table.grant_chips("C", 50)
        assert table.stacks["C"] == 50

    def test_negative_adjustment_cannot_go_below_zero(self):
        table = seated_table("A")
        with pytest.raises(TableError) as exc:
            table.grant_chips("A", -101)
        assert exc.value.code == "negative_balance"
        table.grant_chips("A", -100)
        assert table.stacks["A"] == 0

    def test_zero_grant_is_rejected(self):
        with pytest.raises(TableError):
            seated_table("A").grant_chips("A", 0)

    def test_cannot_stand_up_during_own_hand(self):
        table = seated_table("A", "B")
        table.start_hand()
        with pytest.raises(TableError) as exc:
            table.stand_up("A")
        assert exc.value.code == "player_in_hand"

    def test_standing_up_keeps_chips_in_the_room(self):
        table = seated_table("A", "B")
        table.stand_up("A")
        assert table.stacks["A"] == 100
        table.take_seat("A", 5)
        assert table.stacks["A"] == 100

    def test_ledger_matches_stacks_and_summary_nets_to_zero(self):
        table = seated_table("A", "B", "C")
        for _ in range(5):
            hand = table.start_hand()
            hand.act(call(hand.actor))
            while hand.legal_actions(hand.actor).call_amount:
                hand.act(call(hand.actor))
            check_down(hand)
            table.finish_hand()
        for player, stack in table.stacks.items():
            assert sum(e.amount for e in table.ledger if e.player_id == player) == stack
        summary = table.summary()
        assert sum(row.net for row in summary.values()) == 0
        assert all(row.granted == 100 for row in summary.values())
        assert sum(row.stack for row in summary.values()) == 300


class TestSevenDeuceBonus:
    """Rule #27: everyone else seated pays the bluffer up to what they have after the pot."""

    def test_disabled_by_default(self):
        table = seated_table("A", "B")  # make_table() does not pass seven_deuce_bonus
        assert table.seven_deuce_bonus == 0

    @staticmethod
    def table_with(bonus: int, chips: dict[str, int], sitting_out: tuple[str, ...] = ()):
        """Seats players 1, 2, 3... in order; a player with 0 chips is seated but gets none."""
        table = make_table(seven_deuce_bonus=bonus)
        for seat, (player, amount) in enumerate(chips.items(), start=1):
            table.take_seat(player, seat)
            if amount:
                table.grant_chips(player, amount)
        for player in sitting_out:
            table.sit_out(player)
        return table

    @staticmethod
    def play(table: TableSession, order: list[str], holes: dict[str, str], showdown=False):
        deck = make_deck(order, holes=holes, board="7d7c2s9h4c")
        table._shuffle = lambda: deck
        hand = table.start_hand()
        if showdown:
            hand.act(call(hand.actor))
            check_down(hand)
        else:
            hand.act(raise_to(hand.actor, 6))
            while not hand.is_complete:
                hand.act(fold(hand.actor))
        table.finish_hand()
        return hand

    @staticmethod
    def bonus_entries(table: TableSession) -> set[tuple[str, int]]:
        return {(e.player_id, e.amount) for e in table.ledger if e.kind == LedgerKind.SEVEN_DEUCE}

    def test_a_bluff_win_with_seven_deuce_charges_the_other_player(self):
        # Button is seat 1 (A): order (B, A), A is the SB and acts first heads-up.
        table = self.table_with(50, {"A": 100, "B": 100})
        self.play(table, ["B", "A"], {"A": "7h2h", "B": "AsAd"})

        assert self.bonus_entries(table) == {("A", 50), ("B", -50)}
        assert table.stacks == {"A": 152, "B": 48}

    def test_a_showdown_win_with_seven_deuce_earns_nothing_extra(self):
        table = self.table_with(50, {"A": 100, "B": 100})
        self.play(table, ["B", "A"], {"A": "7h2h", "B": "AsAd"}, showdown=True)

        assert self.bonus_entries(table) == set()

    def test_no_bonus_entries_when_disabled(self):
        table = self.table_with(0, {"A": 100, "B": 100})
        self.play(table, ["B", "A"], {"A": "7h2h", "B": "AsAd"})

        assert self.bonus_entries(table) == set()

    def test_a_short_payer_pays_only_what_they_have_left(self):
        table = self.table_with(50, {"A": 100, "B": 30})
        self.play(table, ["B", "A"], {"A": "7h2h", "B": "AsAd"})

        # B loses the 2-chip big blind first, then pays the 28 left; A gets exactly that.
        assert self.bonus_entries(table) == {("A", 28), ("B", -28)}
        assert table.stacks == {"A": 130, "B": 0}

    def test_a_seated_player_with_no_chips_pays_nothing(self):
        table = self.table_with(50, {"A": 100, "B": 100, "C": 0})
        # C has no chips, so only A and B are dealt in: order (B, A) with A on the button.
        self.play(table, ["B", "A"], {"A": "7h2h", "B": "AsAd"})

        assert self.bonus_entries(table) == {("A", 50), ("B", -50)}

    def test_a_sitting_out_player_pays_too(self):
        table = self.table_with(50, {"A": 100, "B": 100, "C": 100}, sitting_out=("C",))
        self.play(table, ["B", "A"], {"A": "7h2h", "B": "AsAd"})

        assert self.bonus_entries(table) == {("A", 100), ("B", -50), ("C", -50)}

    def test_every_other_seated_player_pays_and_no_chip_is_created(self):
        # A, B, C play (button A on seat 1: order B, C, A); D has no chips; E sits out.
        chips = {"A": 100, "B": 100, "C": 30, "D": 0, "E": 100}
        table = self.table_with(50, chips, sitting_out=("E",))
        before = sum(table.stacks.values())

        self.play(table, ["B", "C", "A"], {"A": "2h7h", "B": "AsAd", "C": "KsKd"})

        # After the pot: B 99 (SB), C 28 (BB). C can only pay 28 of the 50.
        assert self.bonus_entries(table) == {
            ("A", 128),
            ("B", -50),
            ("C", -28),
            ("E", -50),
        }
        assert sum(table.stacks.values()) == before
        assert min(table.stacks.values()) >= 0
