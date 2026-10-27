"""Regression tests for the read-only review of B8 (docs/collab/2026-10-27-claude-review-b8.md).

Each test failed before its fix.
"""

import asyncio
from types import SimpleNamespace

import pytest
from django.core.cache import cache
from django.test import Client

from apps.accounts import ratelimit as accounts_ratelimit
from apps.games import actor as actor_module
from apps.games.models import HandCommand, LedgerEntry, RoomBan, RoomSeat, User

from .test_actor import (  # noqa: F401
    CHIPS,
    _slow_next_hand,
    by_type,
    connect,
    drain,
    heads_up_room,
    make_user,
    run_async,
    seat,
    send_act,
)
from .test_durability import unfinished_hand
from .test_rooms import alogged_in, apost, logged_in, owned_one_player

pytestmark = [pytest.mark.django_db(transaction=True)]


@pytest.fixture(autouse=True)
def _fresh_rate_limits(monkeypatch):
    cache.clear()
    monkeypatch.setattr(accounts_ratelimit, "time", SimpleNamespace(time=lambda: 1_800_000_030))


def staff(name="admin") -> User:
    user = make_user(name)
    user.is_staff = True
    user.save()
    return user


class TestTimeoutFlag:
    """#1: only the server's own clock commands count as timeouts in a replay."""

    def test_a_client_command_named_like_the_old_clock_is_not_a_timeout(self):
        room, a, b = heads_up_room()
        hand = unfinished_hand(room, a, b)
        HandCommand.objects.create(
            hand=hand, player=a, sequence=1, command_id="timeout-9-1", kind="fold"
        )

        async def body():
            await actor_module.get_actor(room.pk)  # recovery settles the folded hand

        run_async(body)
        steps = Client().get(f"/api/hands/{hand.pk}/replay/").json()["steps"]
        assert steps[1]["action"]["timeout"] is False


class TestKickLimits:
    """#2: nobody kicks the owner or staff."""

    def test_staff_cannot_kick_the_owner_and_nobody_kicks_staff(self):
        room, owner, a = owned_one_player()
        admin = staff()

        async def body():
            as_staff = await alogged_in(admin)
            response = await apost(
                as_staff, f"/api/rooms/{room.pk}/kick/", {"player_id": str(owner.pk)}
            )
            assert response.status_code == 400
            as_owner = await alogged_in(owner)
            response = await apost(
                as_owner, f"/api/rooms/{room.pk}/kick/", {"player_id": str(admin.pk)}
            )
            assert response.status_code == 400

        run_async(body)
        assert not RoomBan.objects.exists()


class TestUnban:
    """#3: deleting a ban (Django admin) takes effect without a restart."""

    def test_a_lifted_ban_lets_the_player_back_at_once(self):
        room, owner, a = owned_one_player()
        b = make_user("bob")

        async def body():
            client = await alogged_in(owner)
            await apost(client, f"/api/rooms/{room.pk}/kick/", {"player_id": str(b.pk)})
            await RoomBan.objects.filter(room=room, user=b).adelete()  # what the admin does
            again = await alogged_in(b)
            response = await apost(again, f"/api/rooms/{room.pk}/seats/", {"seat": 4})
            assert response.status_code == 201

        run_async(body)


class TestSuspendedRoom:
    """#4 and #7: clear answers in a suspended room; spectators can still be kicked."""

    def suspended_room(self):
        room, owner, a = owned_one_player()
        b = make_user("bob")
        RoomSeat.objects.create(room=room, user=b, seat=2)
        unfinished_hand(room, a, b, commands=[(b, "check")])  # out of turn: replay fails
        return room, owner, a, b

    def test_closing_a_suspended_room_is_a_409_not_a_500(self):
        room, owner, a, b = self.suspended_room()

        async def body():
            response = await apost(await alogged_in(owner), f"/api/rooms/{room.pk}/close/")
            assert response.status_code == 409
            assert response.json()["code"] == "room_suspended"

        run_async(body)

    def test_a_spectator_can_still_be_kicked(self):
        room, owner, a, b = self.suspended_room()
        watcher = make_user("watcher")

        async def body():
            client = await alogged_in(owner)
            url = f"/api/rooms/{room.pk}/kick/"
            assert (await apost(client, url, {"player_id": str(watcher.pk)})).status_code == 204
            seated = await apost(client, url, {"player_id": str(b.pk)})
            assert seated.status_code == 409 and seated.json()["code"] == "room_suspended"

        run_async(body)

    def test_chat_from_a_kicked_player_is_dropped(self):
        from apps.games.models import ChatMessage

        room, owner, a = owned_one_player()
        b = make_user("bob")

        async def body():
            table = await actor_module.get_actor(room.pk)
            await table.kick(b.pk)
            table.chat(str(b.pk), "still here")  # sent in the gap before the socket closed
            await asyncio.sleep(0.05)
            assert not await ChatMessage.objects.filter(room=room).aexists()

        run_async(body)


class TestHistoryNumbers:
    """#5 and #8: the hand list balances; the replay names the 7-2 winner by the rule."""

    def test_a_sitting_out_payer_is_in_the_hand_list(self):
        room, a, b = heads_up_room(seven_deuce_bonus=50)
        c = make_user("carol")
        seat(room, c, 3)
        RoomSeat.objects.filter(room=room, user=c).update(sitting_out=True)
        hand = unfinished_hand(room, a, b, commands=[(a, "fold")])  # bob bluffs with 7-2

        async def body():
            await actor_module.get_actor(room.pk)

        run_async(body)
        row = Client().get(f"/api/rooms/{room.pk}/hands/").json()["hands"][0]
        assert row["hand_id"] == hand.pk
        assert sum(p["net"] for p in row["players"]) == 0
        carol = next(p for p in row["players"] if p["display_name"] == "carol")
        assert carol["net"] == -50 and carol["seat"] is None  # not dealt in

    def test_the_winner_is_named_even_when_nobody_could_pay(self):
        from .test_actor import make_room

        room = make_room(seven_deuce_bonus=50)
        a, b = make_user("alice"), make_user("bob")
        seat(room, a, 1, chips=1)  # alice has only the small blind: nothing left to pay with
        seat(room, b, 2)
        hand = unfinished_hand(room, a, b, commands=[(a, "fold")])  # bob's 7-2 wins

        async def body():
            await actor_module.get_actor(room.pk)

        run_async(body)
        assert not LedgerEntry.objects.filter(hand=hand, kind="seven_deuce").exists()
        replay = Client().get(f"/api/hands/{hand.pk}/replay/").json()
        assert replay["seven_deuce_winner"] == str(b.pk)

    def test_a_replay_to_showdown_shows_hands_only_at_the_end(self):
        room, a, b = heads_up_room()
        # Heads-up: alice (small blind) calls, then both check every street to showdown.
        moves = [(a, "call"), (b, "check")] + [(b, "check"), (a, "check")] * 3
        hand = unfinished_hand(room, a, b, commands=moves)

        async def body():
            await actor_module.get_actor(room.pk)

        run_async(body)
        watcher = make_user("watcher")
        steps = logged_in(watcher).get(f"/api/hands/{hand.pk}/replay/").json()["steps"]
        assert len(steps) == len(moves) + 1
        for step in steps[:-1]:
            for player in step["hand"]["players"]:
                assert all(card == "??" for card in player["cards"])
        shown = [p["cards"] for p in steps[-1]["hand"]["players"] if p["cards"]]
        assert shown and all("??" not in cards for cards in shown)


class TestAdmin:
    """#10: the admin does not delete users behind the table actor's back."""

    def test_users_cannot_be_deleted_in_the_admin(self):
        from django.contrib.admin.sites import site

        root = staff("root")
        root.is_superuser = True
        root.save()
        user_admin = site._registry[User]
        assert user_admin.has_delete_permission(SimpleNamespace(user=root)) is False
