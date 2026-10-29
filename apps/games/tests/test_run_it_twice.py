"""House rules, part 2: running it twice, rabbit hunting and showing cards after the hand
(docs/api/ws-protocol.md: HandView.second_board, hand.completed runouts / rabbit_cards,
command.show_cards and cards.shown).
"""

import json
from io import StringIO

import pytest
from django.core.management import call_command

from apps.games import actor as actor_module
from apps.games.engine.hand import HandEngine, IllegalAction
from apps.games.engine.simulate import run_simulation
from apps.games.models import Hand

from .helpers import build_hand, call, check, check_down, fold, raise_to
from .test_actor import (  # noqa: F401
    _slow_next_hand,
    by_type,
    connect,
    drain,
    heads_up_room,
    make_room,
    make_user,
    run_async,
    seat,
    started_hand,
)
from .test_rooms import ROOM, _fresh_rate_limits, alogged_in, apatch, logged_in, post  # noqa: F401

# Seats 1 (A), 4 (B), 7 (C), button on 4: dealt C, A, B; C is the small blind, A the big blind.
THREE = [(1, "A", 51), (4, "B", 100), (7, "C", 100)]


def three_all_in(**kwargs) -> HandEngine:
    """A (51) all in with B and C (100 each) all in too: a main pot of 153, a side pot of 98."""
    engine = build_hand(THREE, button_seat=4, run_it_twice=True, **kwargs)
    engine.act(raise_to("B", 100))
    engine.act(call("C"))
    engine.act(call("A"))
    return engine


def heads_up(**kwargs) -> HandEngine:
    # A holds the button on seat 2 (small blind, acts first before the flop).
    return build_hand([(2, "A", 100), (5, "B", 100)], button_seat=2, **kwargs)


class TestRunItTwice:
    def test_an_all_in_before_the_flop_runs_the_whole_board_twice(self):
        engine = three_all_in(
            holes={"A": "AsAh", "B": "KsKh", "C": "QsQh"},
            board="2c3d9hJs4d",  # A's aces take board 1; B's kings the side pot there
            second_board="Qd5c6h8sTd",  # C's three queens take all of board 2
        )
        assert engine.is_complete and engine.ran_twice
        view = engine.view_for(None)
        assert view["board"] == ["2c", "3d", "9h", "Js", "4d"]
        assert view["second_board"] == ["Qd", "5c", "6h", "8s", "Td"]
        # Main pot 153: 77 to board 1 (the odd chip), 76 to board 2; side pot 98: 49 each.
        assert engine.result().final_stacks == {"C": 76 + 49, "A": 77, "B": 49}
        assert engine.runouts() == [
            {
                "board": ["2c", "3d", "9h", "Js", "4d"],
                "winners": [
                    {"player_id": "A", "seat": 1, "amount": 77},
                    {"player_id": "B", "seat": 4, "amount": 49},
                ],
            },
            {
                "board": ["Qd", "5c", "6h", "8s", "Td"],
                "winners": [{"player_id": "C", "seat": 7, "amount": 125}],
            },
        ]

    def test_the_showdown_names_hands_on_each_board(self):
        engine = three_all_in(
            holes={"A": "AsAh", "B": "KsKh", "C": "QsQh"},
            board="2c3d9hJs4d",
            second_board="Qd5c6h8sTd",
        )
        rows = engine.showdown_hands()
        assert {row["board"] for row in rows} == {1, 2}
        on_two = {row["player_id"]: row["category"] for row in rows if row["board"] == 2}
        assert on_two["C"] == "three_of_a_kind"

    def test_an_all_in_on_the_flop_shares_the_flop(self):
        engine = heads_up(
            run_it_twice=True,
            holes={"A": "AsAh", "B": "KsKh"},
            board="2c3d9hJs4d",
            second_board="Kd5c",
        )
        engine.act(call("A"))
        engine.act(check("B"))
        engine.act(raise_to("B", 98))
        engine.act(call("A"))
        view = engine.view_for(None)
        assert view["second_board"] == ["2c", "3d", "9h", "Kd", "5c"]
        assert engine.result().final_stacks == {"A": 100, "B": 100}  # one board each

    def test_no_second_board_without_an_all_in(self):
        engine = heads_up(run_it_twice=True)
        engine.act(call("A"))
        check_down(engine)
        assert not engine.ran_twice
        assert engine.view_for(None)["second_board"] is None
        assert engine.runouts() is None

    def test_an_all_in_on_the_river_has_nothing_left_to_run(self):
        engine = heads_up(run_it_twice=True)
        engine.act(call("A"))
        engine.act(check("B"))
        for _ in range(2):  # flop and turn; after the flop the big blind acts first
            engine.act(check("B"))
            engine.act(check("A"))
        assert len(engine.board()) == 5
        engine.act(raise_to("B", 98))
        engine.act(call("A"))
        assert engine.is_complete and not engine.ran_twice

    def test_off_the_board_is_dealt_once(self):
        engine = build_hand(THREE, button_seat=4)
        engine.act(raise_to("B", 100))
        engine.act(call("C"))
        engine.act(call("A"))
        assert engine.is_complete and not engine.ran_twice
        assert engine.runouts() is None

    def test_a_hand_run_twice_replays_the_same(self):
        engine = three_all_in()
        replayed = HandEngine.replay(json.loads(json.dumps(engine.record())))
        assert replayed.view_for(None) == engine.view_for(None)
        assert replayed.runouts() == engine.runouts()
        assert replayed.result() == engine.result()

    def test_the_rule_keeps_every_invariant_over_many_hands(self):
        report = run_simulation(hands=300, players=5, seed=21, run_it_twice=True, ante=1)
        assert report.violations == []
        assert report.ran_twice_hands > 20

    @pytest.mark.django_db
    def test_stored_hands_run_twice_pass_the_ledger_check(self):
        call_command(
            "simulate_hands", hands=15, players=4, seed=9, run_it_twice=True, stdout=StringIO()
        )
        out = StringIO()
        call_command("check_ledger", stdout=out)
        assert "OK" in out.getvalue()


class TestRabbitHunt:
    BOARD = "2c3d9hJs4d"

    def test_a_hand_won_before_the_flop_shows_the_whole_board_that_would_have_come(self):
        engine = heads_up(rabbit_hunt=True, holes={"A": "AsAh", "B": "KsKh"}, board=self.BOARD)
        assert engine.rabbit_cards() == []  # never while the hand runs
        engine.act(fold("A"))
        assert engine.rabbit_cards() == ["2c", "3d", "9h", "Js", "4d"]

    def test_a_hand_won_on_the_flop_shows_the_turn_and_river(self):
        engine = heads_up(rabbit_hunt=True, holes={"A": "AsAh", "B": "KsKh"}, board=self.BOARD)
        engine.act(call("A"))
        engine.act(check("B"))
        engine.act(raise_to("B", 10))
        engine.act(fold("A"))
        assert engine.board() == ("2c", "3d", "9h")
        assert engine.rabbit_cards() == ["Js", "4d"]

    def test_nothing_when_the_board_is_complete_or_the_room_does_not_hunt(self):
        engine = heads_up(rabbit_hunt=True)
        engine.act(call("A"))
        check_down(engine)
        assert engine.rabbit_cards() == []
        off = heads_up(rabbit_hunt=False)
        off.act(fold("A"))
        assert off.rabbit_cards() == []


class TestCardsToShow:
    def test_a_player_who_folded_may_show_the_cards_they_were_dealt(self):
        engine = heads_up(holes={"A": "AsAh", "B": "KsKh"}, board="2c3d9hJs4d")
        with pytest.raises(IllegalAction, match="hand_in_progress"):
            engine.cards_to_show("A")
        engine.act(fold("A"))
        assert engine.view_for(None)["players"][0]["cards"] == []  # PokerKit dropped them
        assert engine.cards_to_show("A") == ["As", "Ah"]
        assert engine.cards_to_show("B") == ["Ks", "Kh"]
        with pytest.raises(IllegalAction, match="not_in_hand"):
            engine.cards_to_show("Z")

    def test_cards_the_table_already_sees_cannot_be_shown_again(self):
        engine = heads_up(holes={"A": "AsAh", "B": "KsKh"}, board="2c3d9hJs4d")
        engine.act(call("A"))
        check_down(engine)
        winner = next(row["player_id"] for row in engine.showdown_hands())
        with pytest.raises(IllegalAction, match="already_shown"):
            engine.cards_to_show(winner)


async def send_show(conn, room, hand_id, command_id="show-cards-1"):
    await conn.send_json_to(
        {
            "protocol_version": 1,
            "type": "command.show_cards",
            "room_id": room.pk,
            "hand_id": hand_id,
            "command_id": command_id,
            "payload": {},
        }
    )


async def fold_first(conns: dict, room, started: dict) -> str:
    """Whoever acts first folds; returns their player id."""
    first = started["payload"]["hand"]["actor"]
    await conns[first].send_json_to(
        {
            "protocol_version": 1,
            "type": "command.act",
            "room_id": room.pk,
            "hand_id": started["hand_id"],
            "command_id": "fold-first-1",
            "payload": {"kind": "fold", "amount": None},
        }
    )
    return first


@pytest.mark.django_db(transaction=True)
class TestAtTheTable:
    def test_after_a_fold_the_folder_shows_their_cards_to_everyone(self):
        room, a, b = heads_up_room()
        watcher = make_user("watcher")

        async def body():
            conns = {str(a.pk): await connect(room, a), str(b.pk): await connect(room, b)}
            spectator = await connect(room, watcher)
            started, _ = await started_hand(*conns.values(), spectator)
            folder = await fold_first(conns, room, started)
            completed = by_type(await drain(conns[folder]), "hand.completed")[-1]
            assert len(completed["payload"]["rabbit_cards"]) == 5  # rabbit_hunt is on by default
            assert completed["payload"]["runouts"] is None
            await send_show(conns[folder], room, started["hand_id"])
            mine = await drain(conns[folder])
            assert by_type(mine, "command.ack")
            shown = by_type(await drain(spectator), "cards.shown")[-1]
            assert shown["hand_id"] == started["hand_id"]
            assert shown["payload"]["player_id"] == folder
            assert len(shown["payload"]["cards"]) == 2
            await send_show(conns[folder], room, started["hand_id"], "show-cards-2")
            rejected = by_type(await drain(conns[folder]), "command.rejected")[-1]
            assert rejected["payload"]["code"] == "already_shown"
            return started["hand_id"], folder, shown["payload"]["cards"]

        result = {}

        async def run():
            result["value"] = await body()

        run_async(run)
        hand_id, folder, cards = result["value"]
        stored = Hand.objects.get(pk=hand_id).shown_cards
        assert [(s["player_id"], s["cards"]) for s in stored] == [(folder, cards)]
        replay = logged_in(a).get(f"/api/hands/{hand_id}/replay/").json()
        assert [s["player_id"] for s in replay["shown_cards"]] == [folder]
        assert len(replay["rabbit_cards"]) == 5

    def test_show_cards_is_refused_during_the_hand_and_to_whoever_was_not_dealt_in(self):
        room, a, b = heads_up_room()
        watcher = make_user("watcher")

        async def body():
            conns = {str(a.pk): await connect(room, a), str(b.pk): await connect(room, b)}
            spectator = await connect(room, watcher)
            started, _ = await started_hand(*conns.values(), spectator)
            await send_show(conns[str(a.pk)], room, started["hand_id"])
            early = by_type(await drain(conns[str(a.pk)]), "command.rejected")[-1]
            assert early["payload"]["code"] == "hand_in_progress"
            await fold_first(conns, room, started)
            await drain(spectator)
            await send_show(spectator, room, started["hand_id"], "show-watcher")
            stranger = by_type(await drain(spectator), "command.rejected")[-1]
            assert stranger["payload"]["code"] == "not_in_hand"
            await send_show(conns[str(b.pk)], room, started["hand_id"] + 99, "show-wrong-hand")
            stale = by_type(await drain(conns[str(b.pk)]), "command.rejected")[-1]
            assert stale["payload"]["code"] == "stale_hand"

        run_async(body)

    def test_a_failed_save_is_refused_and_the_same_command_works_again(self, monkeypatch):
        from django.db.models import QuerySet

        room, a, b = heads_up_room()
        real_aupdate = QuerySet.aupdate

        async def broken(self, **kwargs):
            if "shown_cards" in kwargs:
                raise RuntimeError("database gone")
            return await real_aupdate(self, **kwargs)

        async def body():
            conns = {str(a.pk): await connect(room, a), str(b.pk): await connect(room, b)}
            started, _ = await started_hand(*conns.values())
            folder = await fold_first(conns, room, started)
            await drain(conns[folder])
            monkeypatch.setattr(QuerySet, "aupdate", broken)
            await send_show(conns[folder], room, started["hand_id"])
            failed = by_type(await drain(conns[folder]), "command.rejected")[-1]
            assert failed["payload"]["code"] == "internal_error"
            monkeypatch.setattr(QuerySet, "aupdate", real_aupdate)
            await send_show(conns[folder], room, started["hand_id"])  # same command_id
            assert by_type(await drain(conns[folder]), "cards.shown")

        run_async(body)

    def test_too_late_once_the_next_hand_has_started(self, monkeypatch):
        room, a, b = heads_up_room()

        async def body():
            conns = {str(a.pk): await connect(room, a), str(b.pk): await connect(room, b)}
            started, _ = await started_hand(*conns.values())
            monkeypatch.setattr(actor_module.TableActor, "next_hand_delay", 0)
            folder = await fold_first(conns, room, started)
            messages = await drain(conns[folder], wait=0.5)
            assert by_type(messages, "hand.started")  # the next hand is already dealt
            await send_show(conns[folder], room, started["hand_id"])
            late = by_type(await drain(conns[folder]), "command.rejected")[-1]
            assert late["payload"]["code"] == "stale_hand"

        run_async(body)

    def test_an_all_in_runs_twice_at_the_table(self):
        room, a, b = heads_up_room(run_it_twice=True)

        async def body():
            conns = {str(a.pk): await connect(room, a), str(b.pk): await connect(room, b)}
            started, _ = await started_hand(*conns.values())
            first = started["payload"]["hand"]["actor"]
            other = str(b.pk) if first == str(a.pk) else str(a.pk)
            seen = []
            for player, kind, amount in ((first, "raise", 200), (other, "call", None)):
                await conns[player].send_json_to(
                    {
                        "protocol_version": 1,
                        "type": "command.act",
                        "room_id": room.pk,
                        "hand_id": started["hand_id"],
                        "command_id": f"all-in-{kind}",
                        "payload": {"kind": kind, "amount": amount},
                    }
                )
                seen += await drain(conns[player])
            completed = by_type(seen, "hand.completed")[-1]["payload"]
            # Sent past the contract check, which knows both boards.
            assert completed["hand"]["second_board"] == completed["runouts"][1]["board"]
            assert completed["rabbit_cards"] == []

        run_async(body)
        hand = Hand.objects.get(room=room, hand_no=1)
        engine = HandEngine.replay(hand.replay_record())
        assert engine.ran_twice
        replay = logged_in(a).get(f"/api/hands/{hand.pk}/replay/").json()
        assert len(replay["runouts"]) == 2
        assert replay["steps"][-1]["hand"]["second_board"] == replay["runouts"][1]["board"]


@pytest.mark.django_db(transaction=True)
class TestRoomSettings:
    def test_a_new_room_hunts_rabbits_and_does_not_run_twice(self):
        room = post(logged_in(make_user("an")), "/api/rooms/", ROOM).json()["room"]
        assert (room["run_it_twice"], room["rabbit_hunt"]) == (False, True)

    def test_the_owner_switches_both(self):
        room = make_room()
        owner = make_user("owner")
        room.owner = owner
        room.save()

        async def body():
            client = await alogged_in(owner)
            url = f"/api/rooms/{room.pk}/"
            response = await apatch(client, url, {"run_it_twice": True, "rabbit_hunt": False})
            assert response.status_code == 200
            info = response.json()["room"]
            assert (info["run_it_twice"], info["rabbit_hunt"]) == (True, False)
            wrong = await apatch(client, url, {"run_it_twice": 1})
            assert wrong.status_code == 400

        run_async(body)
        room.refresh_from_db()
        assert room.engine_rules()["run_it_twice"] is True
