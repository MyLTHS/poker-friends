"""B8: chat, spectators, hand history and replay, the profit/loss summary, staff and the log.

The one rule that must hold: a replay never shows another player's face-down cards, at any step,
to anyone (roadmap B8 "Tự làm").
"""

import json
from types import SimpleNamespace

import pytest
from django.core.cache import cache
from django.test import Client

from apps.accounts import ratelimit as accounts_ratelimit
from apps.games import actor as actor_module
from apps.games.models import ChatMessage, Hand, LedgerEntry, OwnerAction

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
    send_act,
    started_hand,
)
from .test_durability import unfinished_hand
from .test_rooms import alogged_in, apost, logged_in, owned_one_player

pytestmark = [pytest.mark.django_db(transaction=True)]


@pytest.fixture(autouse=True)
def _fresh_rate_limits(monkeypatch):
    cache.clear()
    monkeypatch.setattr(accounts_ratelimit, "time", SimpleNamespace(time=lambda: 1_800_000_030))


async def say(conn, room, text):
    await conn.send_json_to(
        {"protocol_version": 1, "type": "chat.send", "room_id": room.pk, "payload": {"text": text}}
    )


async def play_one_hand(room, a, b):
    """Deal a heads-up hand and let the first to act fold; return its hand_id."""
    ca, cb = await connect(room, a), await connect(room, b)
    started, _ = await started_hand(ca, cb)
    first = a if started["payload"]["hand"]["actor"] == str(a.pk) else b
    await send_act(ca if first is a else cb, room, started["hand_id"], "fold-to-finish", "fold")
    await drain(ca)
    await drain(cb)
    return started["hand_id"], ca, cb


class TestChat:
    def test_everyone_in_the_room_gets_the_line_and_the_version_stays(self):
        room, a, b = heads_up_room()
        watcher = make_user("chi")

        async def body():
            ca, cw = await connect(room, a), await connect(room, watcher)
            await drain(ca)
            await drain(cw)
            version = (await actor_module.get_actor(room.pk)).version
            await say(ca, room, "gg 🎉")
            for conn in (ca, cw):
                lines = by_type(await drain(conn), "chat.message")
                assert len(lines) == 1
                message = lines[0]
                assert message["version"] == version
                assert message["payload"]["message"]["text"] == "gg 🎉"
                assert message["payload"]["message"]["display_name"] == "alice"
            assert (await actor_module.get_actor(room.pk)).version == version

        run_async(body)
        assert list(ChatMessage.objects.values_list("text", flat=True)) == ["gg 🎉"]

    def test_history_returns_the_latest_lines_oldest_first(self):
        room, a, b = heads_up_room()

        async def body():
            ca = await connect(room, a)
            for i in range(3):
                await say(ca, room, f"dòng {i}")
            await drain(ca)

        run_async(body)
        history = logged_in(a).get(f"/api/rooms/{room.pk}/chat/").json()["messages"]
        assert [m["text"] for m in history] == ["dòng 0", "dòng 1", "dòng 2"]

    def test_blank_or_too_long_is_refused_by_the_schema(self):
        room, a, b = heads_up_room()

        async def body():
            ca = await connect(room, a)
            await say(ca, room, "   ")
            await say(ca, room, "x" * 301)
            errors = by_type(await drain(ca), "protocol.error")
            assert [e["payload"]["code"] for e in errors] == ["invalid_message", "invalid_message"]

        run_async(body)
        assert not ChatMessage.objects.exists()

    def test_chatting_too_fast_is_refused(self):
        from apps.games import rooms

        room, a, b = heads_up_room()

        async def body():
            ca = await connect(room, a)
            for i in range(rooms.CHAT_PER_PLAYER.limit + 1):
                await say(ca, room, f"spam {i}")
            messages = await drain(ca)
            assert len(by_type(messages, "chat.message")) == rooms.CHAT_PER_PLAYER.limit
            codes = [e["payload"]["code"] for e in by_type(messages, "protocol.error")]
            assert codes == ["rate_limited"]

        run_async(body)

    def test_a_private_rooms_chat_is_private(self):
        room, owner, a = owned_one_player()
        room.is_private = True
        room.save()
        response = logged_in(make_user("outsider")).get(f"/api/rooms/{room.pk}/chat/")
        assert response.status_code == 404


class TestAudience:
    def test_spectators_come_and_go_and_seated_players_are_not_counted(self):
        room, a, b = heads_up_room()
        watcher = make_user("chi")

        async def body():
            ca = await connect(room, a)
            await drain(ca)
            cw = await connect(room, watcher)
            # The new connection gets the list right after its snapshot.
            first = await cw.receive_json_from(timeout=2)
            assert first["type"] == "audience.updated"
            expected = [{"player_id": str(watcher.pk), "display_name": "chi"}]
            assert first["payload"]["spectators"] == expected
            seen = by_type(await drain(ca), "audience.updated")
            assert seen[-1]["payload"]["spectators"] == expected

            second_tab = await connect(room, watcher)
            await drain(second_tab)
            assert not by_type(await drain(ca), "audience.updated")  # still one spectator

            await cw.disconnect()
            await second_tab.disconnect()
            gone = by_type(await drain(ca), "audience.updated")
            assert gone[-1]["payload"]["spectators"] == []

        run_async(body)


class TestHistory:
    def test_finished_hands_are_listed_with_their_results(self):
        room, a, b = heads_up_room()

        async def body():
            hand_id, *_ = await play_one_hand(room, a, b)
            return hand_id

        run_async(body)
        hand = Hand.objects.get(room=room)
        listing = logged_in(a).get(f"/api/rooms/{room.pk}/hands/").json()["hands"]
        assert [h["hand_id"] for h in listing] == [hand.pk]
        row = listing[0]
        assert row["voided"] is False and row["hand_no"] == 1
        assert sum(p["net"] for p in row["players"]) == 0
        assert {p["display_name"] for p in row["players"]} == {"alice", "bob"}

    def test_a_running_hand_is_neither_listed_nor_replayable(self):
        room, a, b = heads_up_room()

        async def body():
            ca, cb = await connect(room, a), await connect(room, b)
            started, _ = await started_hand(ca, cb)
            client = await alogged_in(a)
            listing = (await client.get(f"/api/rooms/{room.pk}/hands/")).json()["hands"]
            assert listing == []
            replay = await client.get(f"/api/hands/{started['hand_id']}/replay/")
            assert replay.status_code == 404
            assert replay.json()["code"] == "hand_not_found"

        run_async(body)

    @pytest.mark.parametrize("who", ["player", "opponent", "spectator", "anonymous"])
    def test_the_replay_never_shows_someone_elses_face_down_cards(self, who):
        room, a, b = heads_up_room(seven_deuce_bonus=0)
        spectator = make_user("chi")

        async def body():
            await play_one_hand(room, a, b)

        run_async(body)
        hand = Hand.objects.get(room=room)
        viewer = {"player": a, "opponent": b, "spectator": spectator, "anonymous": None}[who]
        client = logged_in(viewer) if viewer else Client()
        response = client.get(f"/api/hands/{hand.pk}/replay/")
        assert response.status_code == 200
        replay = response.json()
        commands = hand.commands.count()
        assert len(replay["steps"]) == commands + 1
        assert replay["steps"][0]["action"] is None
        viewer_id = str(viewer.pk) if viewer else None
        for step in replay["steps"]:
            assert step["hand"]["legal_actions"] is None
            for player in step["hand"]["players"]:
                if player["player_id"] != viewer_id:
                    # Face down ("??") while in the hand, [] once folded: never a real card.
                    assert all(card == "??" for card in player["cards"])
                else:
                    assert "??" not in player["cards"]
        assert sum(r["hand_net"] + r["seven_deuce_net"] for r in replay["results"]) == 0

    def test_a_seven_deuce_bluff_is_shown_only_once_it_won(self):
        # bob (big blind) holds 7-2 and wins when alice folds: rule #27 shows his cards at the end.
        room, a, b = heads_up_room(seven_deuce_bonus=50)
        hand = unfinished_hand(room, a, b, commands=[(a, "fold")])

        async def body():
            await actor_module.get_actor(room.pk)  # recovery settles the finished hand

        run_async(body)
        hand.refresh_from_db()
        replay = Client().get(f"/api/hands/{hand.pk}/replay/").json()
        bob_cards = [
            [p["cards"] for p in step["hand"]["players"] if p["player_id"] == str(b.pk)][0]
            for step in replay["steps"]
        ]
        assert bob_cards[0] == ["??", "??"]
        assert "??" not in bob_cards[-1]
        assert replay["seven_deuce_winner"] == str(b.pk)
        nets = {r["player_id"]: r["seven_deuce_net"] for r in replay["results"]}
        assert nets == {str(a.pk): -50, str(b.pk): 50}

    def test_a_voided_hand_is_listed_but_not_replayed(self):
        from django.core.management import call_command

        room, a, b = heads_up_room()
        hand = unfinished_hand(room, a, b)
        call_command("void_hand", str(hand.pk), "--reason", "test", "--force")
        listing = Client().get(f"/api/rooms/{room.pk}/hands/").json()["hands"]
        assert listing[0]["voided"] is True and listing[0]["players"] == []
        response = Client().get(f"/api/hands/{hand.pk}/replay/")
        assert response.status_code == 409
        assert response.json()["code"] == "hand_voided"

    def test_a_private_rooms_hands_are_private(self):
        room, a, b = heads_up_room()
        room.is_private = True
        room.save()

        async def body():
            await play_one_hand(room, a, b)

        run_async(body)
        hand = Hand.objects.get(room=room)
        outsider = logged_in(make_user("x"))
        assert outsider.get(f"/api/rooms/{room.pk}/hands/").status_code == 404
        assert outsider.get(f"/api/hands/{hand.pk}/replay/").json()["code"] == "hand_not_found"
        assert logged_in(a).get(f"/api/hands/{hand.pk}/replay/").status_code == 200  # seated


class TestSummary:
    def test_profit_and_loss_add_up_to_zero(self):
        room, a, b = heads_up_room()
        LedgerEntry.objects.create(room=room, user=a, kind="grant", amount=100)

        async def body():
            await play_one_hand(room, a, b)

        run_async(body)
        rows = {
            r["display_name"]: r
            for r in Client().get(f"/api/rooms/{room.pk}/summary/").json()["players"]
        }
        assert set(rows) == {"alice", "bob"}
        assert rows["alice"]["granted"] == CHIPS + 100
        assert rows["bob"]["granted"] == CHIPS
        for row in rows.values():
            assert row["net"] == row["balance"] - row["granted"]
            assert row["net"] == row["hands_net"] + row["seven_deuce_net"]
            assert row["hands_played"] == 1
        assert sum(r["net"] for r in rows.values()) == 0


class TestStaffAndLog:
    def test_staff_can_act_as_owner_and_every_owner_action_is_logged(self):
        room, owner, a = owned_one_player()
        staff = make_user("admin")
        staff.is_staff = True
        staff.save()

        async def body():
            for user in (owner, staff):
                client = await alogged_in(user)
                url = f"/api/rooms/{room.pk}/chips/"
                response = await apost(client, url, {"player_id": str(a.pk), "amount": 10})
                assert response.status_code == 200
            client = await alogged_in(owner)
            await client.patch(
                f"/api/rooms/{room.pk}/",
                json.dumps({"big_blind": 4}),
                content_type="application/json",
            )

        run_async(body)
        log = list(
            OwnerAction.objects.order_by("id").values("user_id", "by_staff", "kind", "details")
        )
        assert log == [
            {
                "user_id": owner.pk,
                "by_staff": False,
                "kind": "grant",
                "details": {"player_id": str(a.pk), "amount": 10},
            },
            {
                "user_id": staff.pk,
                "by_staff": True,
                "kind": "grant",
                "details": {"player_id": str(a.pk), "amount": 10},
            },
            {
                "user_id": owner.pk,
                "by_staff": False,
                "kind": "settings",
                "details": {"big_blind": 4},
            },
        ]

    def test_staff_sees_private_rooms(self):
        room, owner, a = owned_one_player()
        room.is_private = True
        room.save()
        staff = make_user("admin")
        staff.is_staff = True
        staff.save()
        assert logged_in(staff).get(f"/api/rooms/{room.pk}/").status_code == 200

    def test_the_log_cannot_be_edited_through_the_orm(self):
        from apps.games.models import AppendOnlyError

        room, owner, a = owned_one_player()
        entry = OwnerAction.objects.create(
            room=room, user=owner, by_staff=False, kind="close", details={}
        )
        entry.details = {"tampered": True}
        with pytest.raises(AppendOnlyError):
            entry.save()


class TestAdmin:
    def test_admin_pages_open_and_game_state_is_read_only(self):
        room = make_room()
        superuser = make_user("root")
        superuser.is_staff = superuser.is_superuser = True
        superuser.save()
        client = logged_in(superuser)
        for url in (
            "/admin/games/room/",
            f"/admin/games/room/{room.pk}/change/",
            "/admin/games/owneraction/",
            "/admin/games/chatmessage/",
            "/admin/games/ledgerentry/",
            "/admin/games/hand/",
        ):
            assert client.get(url).status_code == 200, url
        # Blinds and status belong to the table actor: the admin must not change them behind
        # its back.
        client.post(
            f"/admin/games/room/{room.pk}/change/",
            {"name": "renamed", "small_blind": 50, "big_blind": 100, "status": "closed"},
        )
        room.refresh_from_db()
        assert (room.small_blind, room.big_blind, room.status) == (1, 2, "open")


class TestContract:
    def test_history_responses_match_openapi(self):
        from .test_rooms import TestContract as RoomsContract

        room, a, b = heads_up_room(seven_deuce_bonus=50)

        async def body():
            hand_id, ca, _ = await play_one_hand(room, a, b)
            await say(ca, room, "gg 😏")
            await drain(ca)

        run_async(body)
        client = logged_in(a)
        hand = Hand.objects.get(room=room)
        validate = RoomsContract.validate
        validate(client.get(f"/api/rooms/{room.pk}/chat/").json(), "ChatHistory")
        validate(client.get(f"/api/rooms/{room.pk}/hands/").json(), "HandList")
        validate(client.get(f"/api/rooms/{room.pk}/summary/").json(), "RoomSummary")
        validate(client.get(f"/api/hands/{hand.pk}/replay/").json(), "HandReplay")
        validate(client.get("/api/hands/999999/replay/").json(), "ApiError")
