"""House rules a room may turn on: antes and bomb pots (docs/api/ws-protocol.md, HandView).

Engine tests stack the deck (``helpers.make_deck``) so the winner is known; table tests check
which hand gets which rule; the API tests check the settings like the other room settings.
"""

import json
from io import StringIO

import pytest
from django.core.management import call_command

from apps.games.engine.hand import ActionKind, HandEngine
from apps.games.engine.simulate import run_simulation
from apps.games.engine.table import LedgerKind, TableSession
from apps.games.models import Hand, LedgerEntry, Room, User
from apps.games.services import save_completed_hand

from .helpers import build_hand, call, check, check_down, fold, make_deck, raise_to
from .test_actor import (  # noqa: F401
    CHIPS,
    _slow_next_hand,
    by_type,
    connect,
    drain,
    heads_up_room,
    make_room,
    make_user,
    run_async,
    started_hand,
)
from .test_rooms import (  # noqa: F401
    ROOM,
    _fresh_rate_limits,
    alogged_in,
    apatch,
    logged_in,
    owned_heads_up,
    owned_one_player,
    post,
)

# Seats 1 (A), 4 (B), 7 (C), button on 4: dealt C, A, B; C is the small blind, A the big blind.
THREE = [(1, "A", 100), (4, "B", 100), (7, "C", 100)]


def three_handed(stacks=(100, 100, 100), **kwargs) -> HandEngine:
    seats = [(seat, player, stack) for (seat, player, _), stack in zip(THREE, stacks, strict=True)]
    return build_hand(seats, button_seat=4, **kwargs)


def play_out(engine: HandEngine) -> None:
    """Finish a hand quickly: bet the minimum when nothing is owed, otherwise fold."""
    while not engine.is_complete:
        legal = engine.legal_actions(engine.actor)
        if legal.can_fold:
            engine.act(fold(engine.actor))
        elif legal.min_raise_to is not None:
            engine.act(raise_to(engine.actor, legal.min_raise_to))
        else:
            engine.act(check(engine.actor))


class TestAnte:
    def test_everyone_dealt_in_puts_the_ante_in_before_the_blinds(self):
        engine = three_handed(ante=5)
        assert engine.stacks() == {"C": 94, "A": 93, "B": 95}
        view = engine.view_for(None)
        assert view["ante"] == 5 and view["bomb_pot"] == 0
        assert sum(pot["amount"] for pot in view["pots"]) == 15  # dead money, blinds still bets
        assert engine.actor == "B"  # the blinds work as usual

    def test_a_short_ante_goes_all_in_and_only_plays_for_what_it_matches(self):
        holes = {"C": "AsAh", "A": "KsKh", "B": "QsQh"}
        engine = three_handed(stacks=(100, 100, 3), ante=5, holes=holes, board="2c7d9hJs4d")
        assert engine.stacks()["C"] == 0  # all in on the ante, so no small blind either
        engine.act(call("B"))
        check_down(engine)
        # C wins the 9 its 3 matched; A's kings take what A and B put in beyond that.
        assert engine.result().final_stacks == {"C": 9, "A": 101, "B": 93}

    def test_the_ante_is_in_the_record_and_replays(self):
        engine = three_handed(ante=5)
        engine.act(raise_to("B", 10))
        record = json.loads(json.dumps(engine.record()))
        assert record["config"]["ante"] == 5
        assert HandEngine.replay(record).view_for(None) == engine.view_for(None)


class TestBombPot:
    def test_no_blinds_and_no_betting_before_the_flop(self):
        engine = three_handed(bomb_pot=10)
        assert engine.stacks() == {"C": 90, "A": 90, "B": 90}
        assert len(engine.board()) == 3  # the first decision is on the flop
        assert engine.actor == "C"  # the left of the button
        view = engine.view_for("C")
        assert view["bomb_pot"] == 10 and view["ante"] == 0
        assert view["pots"] == [{"amount": 30, "eligible": ["C", "A", "B"]}]
        assert engine.record()["actions"] == []  # the engine's own checks are not actions

    def test_heads_up_the_player_who_is_not_on_the_button_bets_first(self):
        engine = build_hand([(2, "A", 100), (5, "B", 100)], button_seat=2, bomb_pot=10)
        assert engine.actor == "B"

    def test_a_short_stack_goes_all_in_for_what_it_has(self):
        engine = three_handed(stacks=(100, 100, 4), bomb_pot=10)
        assert engine.stacks()["C"] == 0
        assert engine.actor == "A"  # C cannot act any more
        play_out(engine)
        assert sum(engine.result().final_stacks.values()) == 204

    def test_no_ante_on_top_of_the_bomb(self):
        engine = three_handed(ante=5, bomb_pot=10)
        assert engine.stacks() == {"C": 90, "A": 90, "B": 90}

    def test_everyone_short_runs_the_board_out_at_once(self):
        engine = three_handed(stacks=(8, 6, 4), bomb_pot=10)
        assert engine.is_complete
        assert len(engine.board()) == 5
        assert sum(engine.result().final_stacks.values()) == 18

    def test_a_bomb_pot_replays_the_same(self):
        engine = three_handed(bomb_pot=10)
        engine.act(raise_to("C", 20))
        engine.act(call("A"))
        engine.act(fold("B"))
        replayed = HandEngine.replay(json.loads(json.dumps(engine.record())))
        assert replayed.view_for(None) == engine.view_for(None)
        assert replayed.actor == engine.actor

    def test_a_7_2_bluff_in_a_bomb_pot_still_pays_the_bonus(self):
        # Seats 1 A, 2 B, 3 C; the first hand's button is seat 1, so B is first to act.
        order = ["B", "C", "A"]
        deck = make_deck(order, {"B": "7h2c", "C": "AsAh", "A": "KsKh"}, board="3c8d9hJs4d")
        table = TableSession(
            1, 2, shuffle=lambda: deck, seven_deuce_bonus=5, bomb_pot_every=1, bomb_pot_amount=10
        )
        for seat, player in ((1, "A"), (2, "B"), (3, "C")):
            table.take_seat(player, seat)
            table.grant_chips(player, 100)
        hand = table.start_hand()
        assert hand.config.bomb_pot == 10 and hand.actor == "B"
        hand.act(raise_to("B", 40))
        hand.act(fold("C"))
        hand.act(fold("A"))
        assert hand.seven_deuce_bluff_winner() == "B"
        table.finish_hand()
        assert table.stacks == {"A": 85, "B": 130, "C": 85}  # 30 pot, then 5 from each
        bonus = [e for e in table.ledger if e.kind == LedgerKind.SEVEN_DEUCE]
        assert sorted(e.amount for e in bonus) == [-5, -5, 10]


@pytest.mark.django_db
class TestHandsFromBeforeTheUpgrade:
    def test_a_hand_dealt_before_antes_existed_is_still_saved(self):
        """Its stored config has no ante or bomb_pot key; the engine's record has them at 0."""
        room = Room.objects.create(name="T", small_blind=1, big_blind=2)
        users = [User.objects.create_user(username=name) for name in ("ann", "ben")]
        table = TableSession(1, 2)
        for seat, user in enumerate(users, 1):
            table.take_seat(str(user.pk), seat)
            table.grant_chips(str(user.pk), 100)
        engine = table.start_hand()
        old_config = {
            k: v for k, v in engine.record()["config"].items() if k not in ("ante", "bomb_pot")
        }
        Hand.objects.create(
            room=room, hand_no=1, button_seat=engine.config.button_seat, config=old_config
        )
        play_out(engine)
        before = len(table.ledger)
        table.finish_hand()
        hand = save_completed_hand(room, 1, engine, table.ledger[before:])
        assert hand.completed_at is not None
        assert hand.config == old_config  # kept as it was stored


class TestWhichHand:
    def table(self, **rules) -> TableSession:
        table = TableSession(1, 2, **rules)
        for seat, player in ((1, "A"), (2, "B")):
            table.take_seat(player, seat)
            table.grant_chips(player, 1000)
        return table

    def test_every_nth_hand_by_hand_number_is_a_bomb_pot(self):
        table = self.table(ante=3, bomb_pot_every=3, bomb_pot_amount=20)
        seen = []
        for _ in range(6):
            hand = table.start_hand()
            seen.append((table.hand_no, hand.config.bomb_pot, hand.config.ante))
            play_out(hand)
            table.finish_hand()
        assert seen == [(1, 0, 3), (2, 0, 3), (3, 20, 0), (4, 0, 3), (5, 0, 3), (6, 20, 0)]

    def test_no_bomb_pot_without_an_amount(self):
        table = self.table(bomb_pot_every=1, bomb_pot_amount=0)
        assert table.start_hand().config.bomb_pot == 0


class TestSimulation:
    def test_antes_and_bomb_pots_keep_every_invariant(self):
        report = run_simulation(
            hands=300, players=6, seed=11, ante=1, bomb_pot_every=4, bomb_pot_amount=10
        )
        assert report.hands_played == 300
        assert report.violations == []

    @pytest.mark.django_db
    def test_stored_hands_pass_the_ledger_check(self):
        call_command(
            "simulate_hands",
            hands=12,
            players=4,
            seed=3,
            ante=1,
            bomb_pot_every=3,
            bomb_pot_amount=6,
            stdout=StringIO(),
        )
        out = StringIO()
        call_command("check_ledger", stdout=out)
        assert "OK" in out.getvalue()


@pytest.mark.django_db(transaction=True)
class TestRoomSettings:
    def test_a_new_room_has_no_house_rules_and_is_public(self):
        detail = post(logged_in(make_user("an")), "/api/rooms/", ROOM).json()
        room = detail["room"]
        assert (room["ante"], room["bomb_pot_every"], room["bomb_pot_amount"]) == (0, 0, 0)
        assert room["seven_deuce_bonus"] == 0
        assert detail["is_private"] is False

    def test_a_room_with_an_ante_and_bomb_pots(self):
        body = {**ROOM, "ante": 2, "bomb_pot_every": 5, "bomb_pot_amount": 50}
        response = post(logged_in(make_user("an")), "/api/rooms/", body)
        assert response.status_code == 201
        room = response.json()["room"]
        assert (room["ante"], room["bomb_pot_every"], room["bomb_pot_amount"]) == (2, 5, 50)

    def test_bomb_pots_need_an_amount(self):
        client = logged_in(make_user("an"))
        response = post(client, "/api/rooms/", {**ROOM, "bomb_pot_every": 5})
        assert response.status_code == 400
        assert "bomb_pot_amount" in response.json()["fields"]
        for wrong in ({"ante": -1}, {"bomb_pot_every": 1001}, {"bomb_pot_amount": "5"}):
            assert post(client, "/api/rooms/", {**ROOM, **wrong}).status_code == 400, wrong

    def test_the_owner_turns_bomb_pots_on_and_the_amount_is_checked(self):
        room, owner, a = owned_one_player()

        async def body():
            client = await alogged_in(owner)
            url = f"/api/rooms/{room.pk}/"
            refused = await apatch(client, url, {"bomb_pot_every": 2})
            assert refused.status_code == 400
            assert "bomb_pot_amount" in refused.json()["fields"]
            changed = await apatch(
                client, url, {"bomb_pot_every": 2, "bomb_pot_amount": 30, "ante": 1}
            )
            assert changed.status_code == 200
            info = changed.json()["room"]
            assert (info["ante"], info["bomb_pot_every"], info["bomb_pot_amount"]) == (1, 2, 30)

        run_async(body)
        room.refresh_from_db()
        assert room.engine_rules()["bomb_pot_every"] == 2

    def test_a_hand_over_at_the_deal_is_settled_at_once(self):
        # Heads-up bomb pot of 50 against a 30-chip stack: nobody can bet, the board runs out.
        room, a, b = heads_up_room(bomb_pot_every=1, bomb_pot_amount=50)
        LedgerEntry.objects.create(room=room, user=b, kind="grant", amount=30 - CHIPS)

        async def body():
            ca, cb = await connect(room, a), await connect(room, b)
            messages = await drain(ca)
            [started] = by_type(messages, "hand.started")
            assert started["payload"]["hand"]["complete"] is True
            assert len(started["payload"]["hand"]["board"]) == 5
            assert by_type(messages, "hand.completed")
            await drain(cb)

        run_async(body)
        hand = Hand.objects.get(room=room, hand_no=1)
        assert hand.completed_at is not None
        assert sum(e.amount for e in LedgerEntry.objects.filter(hand=hand)) == 0

    def test_a_bomb_pot_deals_to_the_flop_at_the_table(self):
        room, a, b = heads_up_room(bomb_pot_every=1, bomb_pot_amount=10, ante=3)

        async def body():
            started, _ = await started_hand(await connect(room, a), await connect(room, b))
            hand = started["payload"]["hand"]
            assert (hand["bomb_pot"], hand["ante"]) == (10, 0)
            assert len(hand["board"]) == 3
            assert hand["actor"] is not None

        run_async(body)

    def test_an_ante_reaches_the_table(self):
        room, a, b = heads_up_room(ante=3)

        async def body():
            started, _ = await started_hand(await connect(room, a), await connect(room, b))
            hand = started["payload"]["hand"]
            assert (hand["ante"], hand["bomb_pot"]) == (3, 0)
            assert hand["board"] == []
            assert {p["stack"] for p in hand["players"]} == {200 - 3 - 1, 200 - 3 - 2}

        run_async(body)


def test_an_action_kind_list_stays_the_same():
    """Bomb pots add no action kind: the engine's own pre-flop checks are not actions."""
    assert [str(kind) for kind in ActionKind] == ["fold", "check", "call", "raise"]
