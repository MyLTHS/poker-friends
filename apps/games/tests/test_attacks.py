"""Attack attempts against the backend (roadmap D, "nghĩ như kẻ phá"), kept as regression tests.

Each class is one way of trying to cheat. What was tried, what got through and what was fixed:
docs/collab/d-tan-cong-thu.md. A class marked "Found:" failed before its fix.
"""

import uuid
from types import SimpleNamespace

import pytest
from django.core.cache import cache
from django.test import AsyncClient

from apps.accounts import ratelimit as accounts_ratelimit
from apps.games import actor as actor_module
from apps.games import rooms
from apps.games.models import Hand, HandCommand, Room, RoomMember, RoomSeat

from .test_actor import (  # noqa: F401
    _slow_next_hand,
    _snapshot,
    by_type,
    connect,
    drain,
    heads_up_room,
    make_room,
    make_user,
    run_async,
    seat,
    send_act,
    started_hand,
)
from .test_rooms import alogged_in, apatch, apost

pytestmark = [pytest.mark.django_db(transaction=True)]
HIDDEN = "??"


@pytest.fixture(autouse=True)
def _fresh_rate_limits(monkeypatch):
    cache.clear()
    monkeypatch.setattr(accounts_ratelimit, "time", SimpleNamespace(time=lambda: 1_800_000_030))


def cid() -> str:
    return uuid.uuid4().hex


async def act_as_actor(room: Room, conns: dict, hand_id: int, kind: str, amount=None) -> str:
    """Send ``kind`` from whoever is to act; return their player id."""
    table = await actor_module.get_actor(room.pk)
    player = table.session.current_hand.actor
    await send_act(conns[player], room, hand_id, cid(), kind, amount)
    acks = by_type(await drain(conns[player]), "command.ack")
    assert acks, f"{kind} from {player} was not accepted"
    return player


def assert_sees_only(hand: dict, me: str | None) -> None:
    """``me`` sees their own cards while still in the hand; nobody else's card is face up."""
    for player in hand["players"]:
        cards = player["cards"]
        if player["player_id"] == me and player["in_hand"]:
            assert cards and HIDDEN not in cards, f"{me} cannot see their own cards"
        else:
            assert all(card == HIDDEN for card in cards), (
                f"{me} sees {player['player_id']}'s cards {cards}"
            )


async def commands_in(room: Room) -> int:
    return await HandCommand.objects.filter(hand__room=room).acount()


async def act_message(room_id: int, hand_id: int, command_id: str, kind: str, **extra) -> dict:
    message = {
        "protocol_version": 1,
        "type": "command.act",
        "room_id": room_id,
        "hand_id": hand_id,
        "command_id": command_id,
        "payload": {"kind": kind, "amount": None},
    }
    message.update(extra)
    return message


# ---- 1. Hole cards leaking -------------------------------------------------------------------


class TestReplayLeaks:
    def test_a_replay_shows_each_viewer_only_their_own_cards(self):
        room, a, b = heads_up_room()
        eve = make_user("eve")

        async def body():
            ca, cb = await connect(room, a), await connect(room, b)
            started, _ = await started_hand(ca, cb)
            hand_id = started["hand_id"]
            conns = {str(a.pk): ca, str(b.pk): cb}
            await act_as_actor(room, conns, hand_id, "call")
            await act_as_actor(room, conns, hand_id, "raise", 6)
            await act_as_actor(room, conns, hand_id, "fold")
            assert (await Hand.objects.aget(pk=hand_id)).completed_at is not None

            for viewer, me in ((a, str(a.pk)), (b, str(b.pk)), (eve, None), (None, None)):
                client = await alogged_in(viewer) if viewer else AsyncClient()
                replay = await client.get(f"/api/hands/{hand_id}/replay/")
                assert replay.status_code == 200
                for step in replay.json()["steps"]:
                    assert_sees_only(step["hand"], me)

        run_async(body)

    def test_hand_list_and_summary_carry_no_cards_or_deck(self):
        room, a, b = heads_up_room()

        async def body():
            ca, cb = await connect(room, a), await connect(room, b)
            started, _ = await started_hand(ca, cb)
            await act_as_actor(room, {str(a.pk): ca, str(b.pk): cb}, started["hand_id"], "fold")
            client = await alogged_in(a)
            for path in (f"/api/rooms/{room.pk}/hands/", f"/api/rooms/{room.pk}/summary/"):
                text = (await client.get(path)).content.decode()
                assert '"cards"' not in text and '"deck"' not in text, path

        run_async(body)

    def test_a_running_hand_cannot_be_replayed(self):
        room, a, b = heads_up_room()

        async def body():
            ca, cb = await connect(room, a), await connect(room, b)
            started, _ = await started_hand(ca, cb)
            client = await alogged_in(a)
            response = await client.get(f"/api/hands/{started['hand_id']}/replay/")
            assert response.status_code == 404

        run_async(body)


class TestSnapshotLeaks:
    def test_a_player_who_folded_sees_no_live_cards(self):
        room = make_room()
        users = [make_user(name) for name in ("ann", "ben", "cat")]
        for n, user in enumerate(users, 1):
            seat(room, user, n)

        async def body():
            conns = {str(u.pk): await connect(room, u) for u in users}
            started, _ = await started_hand(*conns.values())
            folder = await act_as_actor(room, conns, started["hand_id"], "fold")
            ws_view = (await _snapshot(conns[folder], room))["hand"]
            user = next(u for u in users if str(u.pk) == folder)
            rest = await (await alogged_in(user)).get(f"/api/rooms/{room.pk}/snapshot/")
            for hand in (ws_view, rest.json()["table"]["hand"]):
                assert_sees_only(hand, folder)
                assert next(p for p in hand["players"] if p["player_id"] == folder)["cards"] == []

        run_async(body)

    def test_a_player_who_stood_up_watches_like_a_spectator(self):
        room = make_room()
        ann, ben, cat = (make_user(name) for name in ("ann", "ben", "cat"))
        for n, user in enumerate((ann, ben, cat), 1):
            seat(room, user, n)

        async def body():
            left = await (await alogged_in(cat)).delete(f"/api/rooms/{room.pk}/seats/me/")
            assert left.status_code == 204
            ca, cb = await connect(room, ann), await connect(room, ben)
            await started_hand(ca, cb)
            cc = await connect(room, cat)
            hand = (await _snapshot(cc, room))["hand"]
            assert {p["player_id"] for p in hand["players"]} == {str(ann.pk), str(ben.pk)}
            assert_sees_only(hand, None)

        run_async(body)


class TestPrivateRoomHistory:
    def test_an_outsider_reads_nothing_of_a_private_room(self):
        room, a, b = heads_up_room(is_private=True, owner=None)
        eve = make_user("eve")

        async def body():
            ca, cb = await connect(room, a), await connect(room, b)
            started, _ = await started_hand(ca, cb)
            await act_as_actor(room, {str(a.pk): ca, str(b.pk): cb}, started["hand_id"], "fold")
            for client in (await alogged_in(eve), AsyncClient()):
                for path in (
                    f"/api/hands/{started['hand_id']}/replay/",
                    f"/api/rooms/{room.pk}/hands/",
                    f"/api/rooms/{room.pk}/summary/",
                    f"/api/rooms/{room.pk}/chat/",
                    f"/api/rooms/{room.pk}/snapshot/",
                ):
                    assert (await client.get(path)).status_code == 404, path

        run_async(body)


# ---- 2. Pretending to be someone else --------------------------------------------------------


class TestSpoofedSender:
    @pytest.mark.parametrize("where", ["payload", "envelope"])
    def test_naming_another_player_in_the_message_is_refused(self, where):
        room, a, b = heads_up_room()

        async def body():
            ca, cb = await connect(room, a), await connect(room, b)
            started, _ = await started_hand(ca, cb)
            to_act = started["payload"]["hand"]["actor"]
            waiting_conn = cb if to_act == str(a.pk) else ca
            message = await act_message(room.pk, started["hand_id"], cid(), "call")
            if where == "payload":
                message["payload"]["player_id"] = to_act
            else:
                message["player_id"] = to_act
            await waiting_conn.send_json_to(message)
            codes = [
                m["payload"]["code"] for m in by_type(await drain(waiting_conn), "command.rejected")
            ]
            assert codes == ["invalid_command"]
            assert await commands_in(room) == 0

        run_async(body)

    def test_a_seat_in_the_payload_is_refused(self):
        room, a, b = heads_up_room()

        async def body():
            ca, cb = await connect(room, a), await connect(room, b)
            started, _ = await started_hand(ca, cb)
            message = await act_message(room.pk, started["hand_id"], cid(), "call")
            message["payload"]["seat"] = 1
            await ca.send_json_to(message)
            codes = [m["payload"]["code"] for m in by_type(await drain(ca), "command.rejected")]
            assert codes == ["invalid_command"]
            assert await commands_in(room) == 0

        run_async(body)


class TestCrossRoom:
    def _two_rooms(self):
        room, a, b = heads_up_room(name="mine")
        other = make_room(name="other")
        x, y = make_user("xavier"), make_user("yara")
        seat(other, x, 1)
        seat(other, y, 2)
        return room, a, b, other, x, y

    def test_another_rooms_id_in_my_socket_is_refused(self):
        room, a, b, other, x, y = self._two_rooms()

        async def body():
            ca, cb = await connect(room, a), await connect(room, b)
            cx, cy = await connect(other, x), await connect(other, y)
            await started_hand(ca, cb)
            theirs, _ = await started_hand(cx, cy)
            message = await act_message(other.pk, theirs["hand_id"], cid(), "call")
            await ca.send_json_to(message)
            codes = [m["payload"]["code"] for m in by_type(await drain(ca), "command.rejected")]
            assert codes == ["invalid_command"]
            assert await commands_in(other) == 0

        run_async(body)

    def test_another_rooms_hand_id_is_a_stale_hand(self):
        room, a, b, other, x, y = self._two_rooms()

        async def body():
            ca, cb = await connect(room, a), await connect(room, b)
            cx, cy = await connect(other, x), await connect(other, y)
            await started_hand(ca, cb)
            theirs, _ = await started_hand(cx, cy)
            await ca.send_json_to(await act_message(room.pk, theirs["hand_id"], cid(), "call"))
            codes = [m["payload"]["code"] for m in by_type(await drain(ca), "command.rejected")]
            assert codes == ["stale_hand"]
            assert await commands_in(other) == 0

        run_async(body)

    def test_another_rooms_command_id_is_not_confirmed(self):
        """Found: the duplicate check looked the command up by hand id alone, so a command id
        from any room's hand came back as a duplicate (or as "reused"), confirming it exists."""
        room, a, b, other, x, y = self._two_rooms()

        async def body():
            cx, cy = await connect(other, x), await connect(other, y)
            theirs, _ = await started_hand(cx, cy)
            victim = theirs["payload"]["hand"]["actor"]
            victim_conn = cx if victim == str(x.pk) else cy
            await send_act(victim_conn, other, theirs["hand_id"], "victim-command-1", "fold")
            await drain(victim_conn)
            assert (await Hand.objects.aget(pk=theirs["hand_id"])).completed_at is not None

            ca, cb = await connect(room, a), await connect(room, b)
            await started_hand(ca, cb)
            message = await act_message(room.pk, theirs["hand_id"], "victim-command-1", "fold")
            await ca.send_json_to(message)
            replies = await drain(ca)
            assert not by_type(replies, "command.ack")
            codes = [m["payload"]["code"] for m in by_type(replies, "command.rejected")]
            assert codes == ["stale_hand"]

        run_async(body)

    def test_another_players_old_command_id_is_not_confirmed(self):
        """Found: same lookup, same room: another player's command id from an earlier hand came
        back as "command_id_reused", telling the sender that id exists."""
        room, a, b = heads_up_room()

        async def body():
            ca, cb = await connect(room, a), await connect(room, b)
            started, _ = await started_hand(ca, cb)
            first = started["payload"]["hand"]["actor"]
            first_conn, other_conn = (ca, cb) if first == str(a.pk) else (cb, ca)
            await send_act(first_conn, room, started["hand_id"], "their-command-1", "fold")
            await drain(first_conn)
            message = await act_message(room.pk, started["hand_id"], "their-command-1", "fold")
            await other_conn.send_json_to(message)
            replies = await drain(other_conn)
            assert not by_type(replies, "command.ack")
            codes = [m["payload"]["code"] for m in by_type(replies, "command.rejected")]
            assert codes == ["no_active_hand"]  # treated as a new command, between two hands

        run_async(body)


class TestOtherPeoplesRooms:
    def test_owner_powers_are_refused_to_a_non_owner(self):
        room, a, b = heads_up_room()
        owner, eve = make_user("owner"), make_user("eve")
        room.owner = owner
        room.save()

        async def body():
            client = await alogged_in(eve)
            base = f"/api/rooms/{room.pk}"
            attempts = [
                await apost(client, f"{base}/chips/", {"player_id": str(eve.pk), "amount": 999}),
                await apost(client, f"{base}/kick/", {"player_id": str(a.pk)}),
                await apost(client, f"{base}/close/"),
                await apost(client, f"{base}/invite/"),
                await apatch(client, f"{base}/", {"seven_deuce_bonus": 999}),
            ]
            assert [r.status_code for r in attempts] == [403] * 5
            refreshed = await Room.objects.aget(pk=room.pk)
            assert refreshed.seven_deuce_bonus == 0 and refreshed.status == Room.Status.OPEN

        run_async(body)

    def test_a_private_room_is_invisible_to_an_outsider(self):
        room, a, b = heads_up_room(is_private=True)
        owner, eve = make_user("owner"), make_user("eve")
        room.owner = owner
        room.save()

        async def body():
            client = await alogged_in(eve)
            base = f"/api/rooms/{room.pk}"
            attempts = [
                await client.get(f"{base}/"),
                await apost(client, f"{base}/seats/", {"seat": 3}),
                await apost(client, f"{base}/chips/", {"player_id": str(a.pk), "amount": 5}),
                await apost(client, f"{base}/kick/", {"player_id": str(a.pk)}),
            ]
            assert [r.status_code for r in attempts] == [404] * 4
            assert not await RoomSeat.objects.filter(room=room, user=eve).aexists()

        run_async(body)

    def test_leaving_someone_elses_seat_is_impossible(self):
        room, a, b = heads_up_room()
        eve = make_user("eve")

        async def body():
            response = await (await alogged_in(eve)).delete(f"/api/rooms/{room.pk}/seats/me/")
            assert response.status_code == 409 and response.json()["code"] == "not_seated"
            assert await RoomSeat.objects.filter(room=room).acount() == 2

        run_async(body)


# ---- 3. Double clicks, two tabs, wrong turn -------------------------------------------------


class TestClicksAndTabs:
    def test_two_tabs_sending_the_same_command_id_apply_it_once(self):
        room, a, b = heads_up_room()

        async def body():
            tab1, tab2 = await connect(room, a), await connect(room, a)
            cb = await connect(room, b)
            started, _ = await started_hand(tab1, tab2, cb)
            # Heads-up, the first button is seat 1 (alice) and the button acts first.
            assert started["payload"]["hand"]["actor"] == str(a.pk)
            message = await act_message(room.pk, started["hand_id"], "double-click-1", "call")
            await tab1.send_json_to(message)
            await tab2.send_json_to(message)
            acks = by_type(await drain(tab1), "command.ack") + by_type(
                await drain(tab2), "command.ack"
            )
            assert sorted(m["payload"]["duplicate"] for m in acks) == [False, True]
            assert await commands_in(room) == 1

        run_async(body)

    def test_two_tabs_sending_opposite_commands_apply_only_one(self):
        room, a, b = heads_up_room()

        async def body():
            tab1, tab2 = await connect(room, a), await connect(room, a)
            cb = await connect(room, b)
            started, _ = await started_hand(tab1, tab2, cb)
            # Heads-up, the first button is seat 1 (alice) and the button acts first.
            assert started["payload"]["hand"]["actor"] == str(a.pk)
            hand_id = started["hand_id"]
            await tab1.send_json_to(await act_message(room.pk, hand_id, cid(), "call"))
            await tab2.send_json_to(await act_message(room.pk, hand_id, cid(), "fold"))
            replies = await drain(tab1) + await drain(tab2)
            assert len(by_type(replies, "command.ack")) == 1
            codes = [m["payload"]["code"] for m in by_type(replies, "command.rejected")]
            assert codes == ["not_your_turn"]
            assert await commands_in(room) == 1

        run_async(body)

    def test_acting_out_of_turn_changes_nothing(self):
        room, a, b = heads_up_room()

        async def body():
            ca, cb = await connect(room, a), await connect(room, b)
            started, _ = await started_hand(ca, cb)
            waiting = cb if started["payload"]["hand"]["actor"] == str(a.pk) else ca
            for kind in ("fold", "call", "check"):
                await waiting.send_json_to(
                    await act_message(room.pk, started["hand_id"], cid(), kind)
                )
            codes = [
                m["payload"]["code"] for m in by_type(await drain(waiting), "command.rejected")
            ]
            assert codes == ["not_your_turn"] * 3
            assert await commands_in(room) == 0

        run_async(body)


# ---- 4. Dropping the connection in the middle of a command -----------------------------------


class TestDisconnectMidCommand:
    def test_a_command_sent_just_before_disconnecting_is_applied_once(self):
        room, a, b = heads_up_room()

        async def body():
            ca, cb = await connect(room, a), await connect(room, b)
            started, _ = await started_hand(ca, cb)
            to_act = started["payload"]["hand"]["actor"]
            user, conn, other = (a, ca, cb) if to_act == str(a.pk) else (b, cb, ca)
            message = await act_message(room.pk, started["hand_id"], "last-words-1", "call")
            await conn.send_json_to(message)
            await conn.disconnect()  # gone before any reply could reach it

            applied = by_type(await drain(other), "action.applied")
            assert [m["payload"]["action"]["player_id"] for m in applied] == [to_act]
            table = await actor_module.get_actor(room.pk)
            assert table.suspended is False

            again = await connect(room, user)
            await again.send_json_to(message)  # the client retries after reconnecting
            acks = by_type(await drain(again), "command.ack")
            assert [m["payload"]["duplicate"] for m in acks] == [True]
            assert await commands_in(room) == 1

        run_async(body)


# ---- 5. Flooding the REST endpoints ----------------------------------------------------------


class TestRestFlooding:
    def test_sitting_down_and_standing_up_in_a_loop_is_slowed_down(self):
        """Found (audit B, deferred): no limit, a script could churn seat.updated for a table."""
        room = make_room()
        eve = make_user("eve")

        async def body():
            client = await alogged_in(eve)
            base = f"/api/rooms/{room.pk}/seats/"
            codes = []
            for _ in range(rooms.SEAT_CHANGES_PER_PLAYER.limit // 2):
                codes.append((await apost(client, base, {"seat": 3})).status_code)
                codes.append((await client.delete(f"{base}me/")).status_code)
            assert set(codes) == {201, 204}
            blocked = await apost(client, base, {"seat": 3})
            assert blocked.status_code == 429 and int(blocked["Retry-After"]) > 0
            assert not await RoomSeat.objects.filter(room=room, user=eve).aexists()

        run_async(body)

    def test_guessing_invite_links_is_slowed_down(self):
        """Found (audit B, deferred): no limit on trying invite tokens from one address."""
        room = make_room(is_private=True, invite_token="the-real-invite-token")
        eve = make_user("eve")

        async def body():
            client = await alogged_in(eve)
            for i in range(rooms.JOINS_PER_IP.limit):
                guess = await apost(client, "/api/rooms/join/", {"invite_token": f"guess-{i}"})
                assert guess.status_code == 404
            real = await apost(
                client, "/api/rooms/join/", {"invite_token": "the-real-invite-token"}
            )
            assert real.status_code == 429
            assert not await RoomMember.objects.filter(room=room, user=eve).aexists()

        run_async(body)

    def test_friends_on_one_wifi_all_get_in_with_the_real_link(self):
        """The limit is for guessing: a whole table opening the real link, several times each,
        from one shared IP, must not be locked out."""
        room = make_room(is_private=True, invite_token="the-real-invite-token")
        friends = [make_user(f"friend{i}") for i in range(12)]

        async def body():
            for friend in friends:
                client = await alogged_in(friend)
                for _ in range(3):
                    joined = await apost(
                        client, "/api/rooms/join/", {"invite_token": "the-real-invite-token"}
                    )
                    assert joined.status_code == 200
            assert await RoomMember.objects.filter(room=room).acount() >= len(friends)

        run_async(body)
