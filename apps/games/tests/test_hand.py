import json
import warnings

import pytest

from apps.games.engine.hand import HIDDEN_CARD, HandEngine, IllegalAction, deal_order

from .helpers import build_hand, call, check, check_down, fold, raise_to


def three_handed(**kwargs) -> HandEngine:
    # Seats 1 (A), 4 (B), 7 (C); button on seat 4 -> C is SB, A is BB, B is the button.
    return build_hand([(1, "A", 100), (4, "B", 100), (7, "C", 100)], button_seat=4, **kwargs)


def heads_up(**kwargs) -> HandEngine:
    # A holds the button on seat 2.
    return build_hand([(2, "A", 100), (5, "B", 100)], button_seat=2, **kwargs)


class TestSeatingAndBlinds:
    def test_deal_order_starts_left_of_button_and_ends_on_button(self):
        engine = three_handed()
        assert engine.player_order == ("C", "A", "B")
        assert engine.stacks() == {"A": 98, "B": 100, "C": 99}

    def test_deal_order_wraps_around_the_table(self):
        engine = three_handed()
        assert deal_order(engine.config.seats, button_seat=7) == ["A", "B", "C"]

    def test_heads_up_button_posts_small_blind_and_acts_first_preflop(self):
        engine = heads_up()
        assert engine.stacks() == {"A": 99, "B": 98}
        assert engine.actor == "A"

    def test_heads_up_big_blind_acts_first_after_the_flop(self):
        engine = heads_up()
        engine.act(call("A"))
        engine.act(check("B"))
        assert engine.board() == engine.config.deck[5:8]
        assert engine.actor == "B"

    def test_three_handed_button_acts_first_preflop(self):
        assert three_handed().actor == "B"


class TestLegalActions:
    def test_legal_actions_for_heads_up_button_preflop(self):
        legal = heads_up().legal_actions("A")
        assert legal.can_fold is True
        assert legal.can_check is False
        assert legal.call_amount == 1
        assert legal.min_raise_to == 4
        assert legal.max_raise_to == 100

    def test_big_blind_can_check_its_option(self):
        engine = heads_up()
        engine.act(call("A"))
        legal = engine.legal_actions("B")
        assert legal.can_check is True
        assert legal.call_amount == 0

    def test_acting_out_of_turn_is_rejected(self):
        engine = three_handed()
        with pytest.raises(IllegalAction) as exc:
            engine.act(call("A"))
        assert exc.value.code == "not_your_turn"

    def test_unknown_player_is_rejected(self):
        with pytest.raises(IllegalAction) as exc:
            three_handed().act(call("Z"))
        assert exc.value.code == "not_your_turn"

    def test_checking_when_facing_a_bet_is_rejected(self):
        with pytest.raises(IllegalAction) as exc:
            heads_up().act(check("A"))
        assert exc.value.code == "cannot_check"

    def test_folding_when_check_is_free_is_rejected(self):
        engine = heads_up()
        engine.act(call("A"))
        with pytest.raises(IllegalAction) as exc:
            engine.act(fold("B"))
        assert exc.value.code == "cannot_fold"

    def test_fold_with_free_check_is_rejected_even_when_warnings_are_ignored(self):
        # Production does not turn warnings into errors; PokerKit's can_fold() then says True.
        with warnings.catch_warnings():
            warnings.simplefilter("ignore")
            engine = heads_up()
            engine.act(call("A"))
            assert engine.legal_actions("B").can_fold is False
            with pytest.raises(IllegalAction) as exc:
                engine.act(fold("B"))
            assert exc.value.code == "cannot_fold"

    def test_side_pot_players_cannot_check_fold_away_from_an_all_in_player(self):
        # Regression (simulation hand 104): both side-pot players folded with a free check,
        # leaving a side pot nobody could win; PokerKit crashed in push_chips.
        with warnings.catch_warnings():
            warnings.simplefilter("ignore")
            engine = build_hand([(1, "X", 10), (2, "A", 100), (3, "B", 100)], button_seat=3)
            engine.act(raise_to("B", 10))
            engine.act(call("X"))  # all-in
            engine.act(call("A"))
            with pytest.raises(IllegalAction):
                engine.act(fold("A"))
            check_down(engine)
            assert sum(engine.result().final_stacks.values()) == 210

    @pytest.mark.parametrize("amount", [3, 101, None])
    def test_raise_outside_limits_is_rejected(self, amount):
        engine = heads_up()
        with pytest.raises(IllegalAction) as exc:
            engine.act(raise_to("A", amount))
        assert exc.value.code == "invalid_amount"

    def test_rejected_action_does_not_change_state(self):
        engine = heads_up()
        before = engine.view_for(None)
        with pytest.raises(IllegalAction):
            engine.act(raise_to("A", 3))
        assert engine.view_for(None) == before

    def test_acting_after_hand_is_complete_is_rejected(self):
        engine = heads_up()
        engine.act(fold("A"))
        with pytest.raises(IllegalAction) as exc:
            engine.act(check("B"))
        assert exc.value.code == "hand_complete"

    def test_check_raises_the_same_errors_as_act_without_changing_state(self):
        engine = heads_up()
        before = engine.view_for(None)
        with pytest.raises(IllegalAction) as exc:
            engine.check(raise_to("A", 3))
        assert exc.value.code == "invalid_amount"
        assert engine.view_for(None) == before

    def test_check_passes_for_a_legal_action_without_applying_it(self):
        engine = heads_up()
        before = engine.view_for(None)
        engine.check(call("A"))  # does not raise
        assert engine.view_for(None) == before

    def test_short_all_in_does_not_reopen_raising(self):
        engine = build_hand(
            [(1, "SB", 100), (2, "BB", 100), (3, "UTG", 100), (4, "BTN", 13)],
            button_seat=4,
        )
        engine.act(raise_to("UTG", 10))
        engine.act(raise_to("BTN", 13))  # all-in, short of a full raise
        engine.act(fold("SB"))
        engine.act(call("BB"))
        legal = engine.legal_actions("UTG")
        assert legal.call_amount == 3
        assert legal.min_raise_to is None
        with pytest.raises(IllegalAction):
            engine.act(raise_to("UTG", 30))


class TestPayouts:
    def test_fold_awards_blinds_to_the_remaining_player(self):
        engine = heads_up()
        engine.act(fold("A"))
        assert engine.is_complete
        assert engine.result().final_stacks == {"A": 99, "B": 101}
        assert engine.result().net == {"A": -1, "B": 1}

    def test_multi_level_side_pots(self):
        engine = build_hand(
            [(1, "P10", 10), (2, "P30", 30), (3, "P60", 60), (4, "P100", 100)],
            button_seat=4,
            holes={"P10": "AsAh", "P30": "KsKh", "P60": "QsQh", "P100": "3s3h"},
            board="2c7d9hJc4s",
        )
        engine.act(raise_to("P60", 60))
        # Nobody left can match more than 60, so the big stack may only call.
        assert engine.legal_actions("P100").min_raise_to is None
        engine.act(call("P100"))
        engine.act(call("P10"))
        engine.act(call("P30"))
        assert engine.is_complete
        assert engine.result().final_stacks == {"P10": 40, "P30": 60, "P60": 60, "P100": 40}

    def test_split_pot_with_odd_chip_conserves_chips(self):
        engine = three_handed(
            holes={"C": "2c3d", "A": "4h5d", "B": "6c7d"},
            board="AsKsQsJsTs",
        )
        engine.act(call("B"))
        engine.act(fold("C"))
        engine.act(check("A"))
        check_down(engine)
        stacks = engine.result().final_stacks
        assert stacks["C"] == 99
        assert sorted([stacks["A"], stacks["B"]]) == [100, 101]
        assert sum(stacks.values()) == 300

    def test_best_hand_wins_at_showdown(self):
        engine = heads_up(holes={"B": "AcAd", "A": "7c2d"}, board="KhQs9c5d3h")
        engine.act(call("A"))
        check_down(engine)
        assert engine.result().final_stacks == {"A": 98, "B": 102}

    def test_chips_are_conserved_after_every_action(self):
        engine = three_handed()
        total = engine.total_chips()
        for action in [raise_to("B", 6), call("C"), call("A")]:
            engine.act(action)
            assert engine.total_chips() == total
        while not engine.is_complete:
            engine.act(check(engine.actor))
            assert engine.total_chips() == total


class TestTimeout:
    def test_timeout_folds_when_facing_a_bet(self):
        engine = heads_up()
        applied = engine.timeout("A")
        assert applied == fold("A")
        assert engine.result().final_stacks == {"A": 99, "B": 101}

    def test_timeout_checks_when_check_is_free(self):
        engine = heads_up()
        engine.act(call("A"))
        applied = engine.timeout("B")
        assert applied == check("B")
        assert not engine.is_complete
        assert len(engine.board()) == 3

    def test_timeout_for_a_player_who_is_not_acting_is_rejected(self):
        with pytest.raises(IllegalAction):
            heads_up().timeout("B")


class TestProjection:
    HOLES = {"C": "2c3d", "A": "4h5d", "B": "6c7d"}
    BOARD = "AsKsQsJs9h"

    def secret_cards_of(self, *players):
        return {card for p in players for card in (self.HOLES[p][:2], self.HOLES[p][2:])}

    def leaked(self, view, players):
        text = json.dumps(view)
        return [card for card in self.secret_cards_of(*players) if f'"{card}"' in text]

    def test_player_sees_own_cards_only(self):
        engine = three_handed(holes=self.HOLES, board=self.BOARD)
        view = engine.view_for("A")
        me = next(p for p in view["players"] if p["player_id"] == "A")
        assert me["cards"] == ["4h", "5d"]
        assert self.leaked(view, ["B", "C"]) == []
        others = [p["cards"] for p in view["players"] if p["player_id"] != "A"]
        assert others == [["??", "??"], ["??", "??"]]

    def test_spectator_sees_no_hole_cards(self):
        engine = three_handed(holes=self.HOLES, board=self.BOARD)
        assert self.leaked(engine.view_for(None), ["A", "B", "C"]) == []

    def test_view_never_contains_the_deck(self):
        engine = three_handed(holes=self.HOLES, board=self.BOARD)
        view = engine.view_for("A")
        assert "deck" not in json.dumps(view)
        upcoming_board = {"As", "Ks", "Qs", "Js", "9h"}
        assert not any(f'"{card}"' in json.dumps(view) for card in upcoming_board)

    def test_folded_player_still_cannot_see_others(self):
        engine = three_handed(holes=self.HOLES, board=self.BOARD)
        engine.act(fold("B"))
        assert self.leaked(engine.view_for("B"), ["A", "C"]) == []

    def test_board_is_public_once_dealt(self):
        engine = three_handed(holes=self.HOLES, board=self.BOARD)
        engine.act(call("B"))
        engine.act(call("C"))
        engine.act(check("A"))
        assert engine.view_for(None)["board"] == ["As", "Ks", "Qs"]

    def test_actor_view_includes_legal_actions_and_others_do_not(self):
        engine = three_handed()
        assert engine.view_for("B")["legal_actions"]["call_amount"] == 2
        assert engine.view_for("A")["legal_actions"] is None

    def test_winning_hand_is_revealed_at_showdown(self):
        engine = heads_up(holes={"B": "AcAd", "A": "7c2d"}, board="KhQs9c5d3h")
        engine.act(call("A"))
        check_down(engine)
        view = engine.view_for(None)
        winner = next(p for p in view["players"] if p["player_id"] == "B")
        assert winner["cards"] == ["Ac", "Ad"]

    def test_winner_by_fold_keeps_cards_hidden(self):
        engine = heads_up(holes={"B": "AcAd", "A": "7c2d"}, board="KhQs9c5d3h")
        engine.act(fold("A"))
        assert '"Ac"' not in json.dumps(engine.view_for(None))


class TestReplay:
    def play_sample_hand(self) -> HandEngine:
        engine = three_handed(holes={"C": "2c3d", "A": "AhAd", "B": "6c7d"}, board="Kh8s4c9dJc")
        engine.act(raise_to("B", 6))
        engine.act(call("C"))
        engine.act(raise_to("A", 20))
        engine.act(call("B"))
        engine.act(fold("C"))
        engine.act(raise_to("A", 30))
        engine.act(call("B"))
        engine.timeout("A")
        engine.act(raise_to("B", 50))
        engine.act(call("A"))
        check_down(engine)
        return engine

    def test_replay_reproduces_the_same_result(self):
        original = self.play_sample_hand()
        record = json.loads(json.dumps(original.record()))
        replayed = HandEngine.replay(record)
        assert replayed.is_complete
        assert replayed.result() == original.result()
        assert replayed.view_for(None) == original.view_for(None)

    def test_record_contains_every_applied_action_including_timeouts(self):
        record = self.play_sample_hand().record()
        kinds = [a["kind"] for a in record["actions"]]
        assert kinds[:8] == ["raise", "call", "raise", "call", "fold", "raise", "call", "check"]


class TestSevenDeuceBonus:
    """Rule #27: the bonus goes to a 7-2 holder who takes the pot because everyone folded."""

    def test_a_bluff_win_with_seven_deuce_is_flagged(self):
        engine = heads_up(holes={"A": "7c2d", "B": "AcAd"}, board="KhQs9c5d3h")
        engine.act(raise_to("A", 6))
        engine.act(fold("B"))
        assert engine.seven_deuce_bluff_winner() == "A"

    def test_a_showdown_win_with_seven_deuce_is_not_flagged(self):
        # A's 7h2h plus the board makes a full house, beating B's two pair of aces and sevens.
        engine = heads_up(holes={"A": "7h2h", "B": "AsAd"}, board="7d7c2s9h4c")
        engine.act(call("A"))
        check_down(engine)
        assert engine.seven_deuce_bluff_winner() is None

    def test_a_bluff_win_without_seven_deuce_is_not_flagged(self):
        engine = heads_up(holes={"A": "7c3d", "B": "AcAd"}, board="KhQs9c5d3h")
        engine.act(raise_to("A", 6))
        engine.act(fold("B"))
        assert engine.seven_deuce_bluff_winner() is None

    def test_folding_seven_deuce_is_not_flagged(self):
        engine = heads_up(holes={"A": "AcAd", "B": "7c2d"}, board="KhQs9c5d3h")
        engine.act(raise_to("A", 6))
        engine.act(fold("B"))
        assert engine.seven_deuce_bluff_winner() is None

    def test_a_multiway_bluff_win_is_flagged(self):
        # B is the button and acts first preflop, then C (SB) and A (BB).
        engine = three_handed(holes={"A": "AcAd", "B": "2s7s", "C": "KcKd"}, board="")
        engine.act(raise_to("B", 6))
        engine.act(fold("C"))
        engine.act(fold("A"))
        assert engine.seven_deuce_bluff_winner() == "B"

    def test_a_walk_counts_as_a_bluff(self):
        # Everyone folds to the big blind, who never had to act: still a bonus (rule #27).
        engine = three_handed(holes={"A": "7d2c", "B": "AcAd", "C": "KcKd"}, board="")
        engine.act(fold("B"))
        engine.act(fold("C"))
        assert engine.seven_deuce_bluff_winner() == "A"

    def test_an_unfinished_hand_has_no_winner_yet(self):
        engine = heads_up(holes={"A": "7c2d", "B": "AcAd"}, board="KhQs9c5d3h")
        assert engine.seven_deuce_bluff_winner() is None


class TestSevenDeuceReveal:
    def bluff(self, seven_deuce_bonus: int) -> HandEngine:
        engine = three_handed(
            holes={"A": "AcAd", "B": "2s7s", "C": "KcKd"},
            board="",
            seven_deuce_bonus=seven_deuce_bonus,
        )
        engine.act(raise_to("B", 6))
        engine.act(fold("C"))
        engine.act(fold("A"))
        return engine

    @staticmethod
    def cards(view: dict, player: str) -> list[str]:
        return next(p["cards"] for p in view["players"] if p["player_id"] == player)

    @pytest.mark.parametrize("viewer", [None, "A", "B", "C"])
    def test_everyone_sees_the_winning_seven_deuce(self, viewer):
        view = self.bluff(seven_deuce_bonus=50).view_for(viewer)
        assert self.cards(view, "B") == ["2s", "7s"]

    @pytest.mark.parametrize("viewer", [None, "B"])
    def test_folded_cards_stay_hidden(self, viewer):
        view = self.bluff(seven_deuce_bonus=50).view_for(viewer)
        shown = {card for p in view["players"] if p["player_id"] != "B" for card in p["cards"]}
        assert shown <= {HIDDEN_CARD}

    def test_no_reveal_when_the_room_has_no_bonus(self):
        view = self.bluff(seven_deuce_bonus=0).view_for(None)
        assert self.cards(view, "B") == [HIDDEN_CARD, HIDDEN_CARD]

    def test_no_reveal_while_the_hand_is_running(self):
        engine = three_handed(
            holes={"A": "AcAd", "B": "2s7s", "C": "KcKd"}, board="", seven_deuce_bonus=50
        )
        engine.act(raise_to("B", 6))
        engine.act(fold("C"))
        assert self.cards(engine.view_for("A"), "B") == [HIDDEN_CARD, HIDDEN_CARD]

    def test_replay_reproduces_the_bonus_and_the_reveal(self):
        original = self.bluff(seven_deuce_bonus=50)
        record = json.loads(json.dumps(original.record()))

        replayed = HandEngine.replay(record)

        assert record["config"]["seven_deuce_bonus"] == 50
        assert replayed.seven_deuce_bluff_winner() == "B"
        assert replayed.view_for(None) == original.view_for(None)


class TestShowdownHands:
    """The made hand of every player whose cards are face up at a showdown (nobody else's)."""

    @staticmethod
    def ranks(entry) -> str:
        return "".join(card[0] for card in entry["cards"])

    def test_only_the_shown_winner_gets_a_hand_when_the_loser_mucks(self):
        # B (big blind) shows first after the river; A cannot win, so A mucks.
        engine = heads_up(holes={"B": "AcAd", "A": "7c2d"}, board="KhQs9c5d3h")
        engine.act(call("A"))
        check_down(engine)
        assert engine.showdown_hands() == [
            {
                "player_id": "B",
                "seat": 5,
                "category": "one_pair",
                "cards": ["Ac", "Ad", "Kh", "Qs", "9c"],
            }
        ]

    def test_both_hands_are_named_when_the_pot_is_split(self):
        engine = heads_up(holes={"A": "AhKd", "B": "AcKs"}, board="9h4h3h2c7s")
        engine.act(call("A"))
        check_down(engine)
        hands = engine.showdown_hands()
        assert [(e["player_id"], e["category"]) for e in hands] == [
            ("A", "high_card"),
            ("B", "high_card"),
        ]
        assert [self.ranks(e) for e in hands] == ["AK974", "AK974"]

    def test_cards_are_ordered_by_what_makes_the_hand(self):
        engine = heads_up(holes={"A": "7h2h", "B": "AsAd"}, board="7d7c2s9h4c")
        engine.act(call("A"))
        check_down(engine)
        (entry,) = [e for e in engine.showdown_hands() if e["player_id"] == "A"]
        assert entry["category"] == "full_house"
        assert self.ranks(entry) == "77722"

    def test_a_wheel_puts_the_ace_last(self):
        engine = heads_up(holes={"A": "Ah5d", "B": "KcKd"}, board="2c3h4sKh9d")
        engine.act(call("A"))
        check_down(engine)
        (entry,) = [e for e in engine.showdown_hands() if e["player_id"] == "A"]
        assert entry["category"] == "straight"
        assert self.ranks(entry) == "5432A"

    def test_an_all_in_loser_mucks_and_gets_no_hand(self):
        # Both hands are face up during the run-out; at the end the losing hand is killed, so
        # its cards (and so its name) are not in the final view.
        engine = heads_up(holes={"A": "AhKh", "B": "QcQd"}, board="9h4hTh2c7s")
        engine.act(raise_to("A", 100))
        engine.act(call("B"))
        assert [(e["player_id"], e["category"]) for e in engine.showdown_hands()] == [
            ("A", "flush")
        ]

    def test_a_named_hand_always_has_face_up_cards_in_the_final_view(self):
        engine = heads_up(holes={"B": "7c2d", "A": "AcAd"}, board="KhQs9c5d3h")
        engine.act(call("A"))
        check_down(engine)
        shown = {p["player_id"]: p["cards"] for p in engine.view_for(None)["players"]}
        for entry in engine.showdown_hands():
            assert HIDDEN_CARD not in shown[entry["player_id"]]
            assert set(entry["cards"]) <= set(shown[entry["player_id"]]) | set(engine.board())

    def test_a_win_by_fold_has_no_showdown(self):
        engine = heads_up(holes={"B": "AcAd", "A": "7c3d"}, board="KhQs9c5d3h")
        engine.act(fold("A"))
        assert engine.showdown_hands() == []

    def test_a_revealed_seven_deuce_bluff_is_not_a_showdown(self):
        engine = heads_up(
            holes={"A": "7c2d", "B": "AcAd"}, board="KhQs9c5d3h", seven_deuce_bonus=50
        )
        engine.act(raise_to("A", 6))
        engine.act(fold("B"))
        assert engine.view_for(None)["players"][0]["cards"] == ["7c", "2d"]
        assert engine.showdown_hands() == []

    def test_a_running_hand_has_no_showdown_yet(self):
        engine = heads_up(holes={"B": "AcAd", "A": "7c2d"}, board="KhQs9c5d3h")
        engine.act(call("A"))
        assert engine.showdown_hands() == []

    def test_replay_gives_the_same_hands(self):
        engine = heads_up(holes={"B": "7c2d", "A": "AcAd"}, board="KhQs9c5d3h")
        engine.act(call("A"))
        check_down(engine)
        replayed = HandEngine.replay(json.loads(json.dumps(engine.record())))
        assert replayed.showdown_hands() == engine.showdown_hands()
