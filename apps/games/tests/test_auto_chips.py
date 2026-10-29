"""Chips without waiting for the owner: sitting down with nothing in the room brings its starting
stack, a busted player buys back in (rebuy), and the owner sets how much (docs/api/openapi.yaml:
createRoom, updateRoom, takeSeat, rebuy).
"""

import importlib

import pytest
from django.apps import apps as django_apps
from django.test import AsyncClient

from apps.games import actor as actor_module
from apps.games.models import LedgerEntry, OwnerAction, Room, User

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
    seat,
    started_hand,
)
from .test_rooms import (  # noqa: F401
    ROOM,
    _fresh_rate_limits,
    alogged_in,
    apatch,
    apost,
    balance,
    logged_in,
    owned_heads_up,
    owned_one_player,
    post,
)
from .test_rooms import TestContract as _Contract  # not collected twice: no Test* name here

pytestmark = [pytest.mark.django_db(transaction=True)]


def grants(room: Room, user: User) -> list[int]:
    entries = LedgerEntry.objects.filter(room=room, user=user, kind="grant").order_by("pk")
    return list(entries.values_list("amount", flat=True))


def busted(room: Room, user: User, n: int) -> None:
    """Seated with nothing left: what losing every chip leaves in the ledger."""
    seat(room, user, n)
    LedgerEntry.objects.create(room=room, user=user, kind="grant", amount=-CHIPS)


class TestStartingStack:
    def test_a_new_room_gives_100_big_blinds_unless_the_owner_picks(self):
        client = logged_in(make_user("an"))

        default = post(client, "/api/rooms/", ROOM)
        assert default.status_code == 201
        assert default.json()["room"]["starting_stack"] == 100 * ROOM["big_blind"]

        picked = post(client, "/api/rooms/", {**ROOM, "starting_stack": 500})
        assert picked.status_code == 201
        assert picked.json()["room"]["starting_stack"] == 500

    def test_the_starting_stack_is_checked(self):
        client = logged_in(make_user("an"))
        for wrong in (0, -5, "500", True, 10_000_001):
            response = post(client, "/api/rooms/", {**ROOM, "starting_stack": wrong})
            assert response.status_code == 400, wrong
            assert "starting_stack" in response.json()["fields"]

    def test_a_room_made_without_one_gets_100_big_blinds(self):
        assert make_room(big_blind=4).starting_stack == 400

    def test_the_default_is_capped(self):
        assert make_room(small_blind=1, big_blind=200_000).starting_stack == 10_000_000

    def test_the_owner_changes_it_between_hands(self):
        room, owner, a = owned_one_player()

        async def body():
            watcher = await connect(room, owner)
            client = await alogged_in(owner)
            response = await apatch(client, f"/api/rooms/{room.pk}/", {"starting_stack": 300})
            assert response.status_code == 200
            assert response.json()["room"]["starting_stack"] == 300
            updated = by_type(await drain(watcher), "room.updated")
            assert updated[-1]["payload"]["room"]["starting_stack"] == 300

        run_async(body)
        room.refresh_from_db()
        assert room.starting_stack == 300

    def test_a_change_during_a_hand_waits_for_the_next_one(self):
        room, owner, a, b = owned_heads_up()

        async def body():
            await started_hand(await connect(room, a), await connect(room, b))
            client = await alogged_in(owner)
            response = await apatch(client, f"/api/rooms/{room.pk}/", {"starting_stack": 300})
            assert response.status_code == 200
            assert response.json()["pending"] == {"starting_stack": 300}
            assert response.json()["room"]["starting_stack"] == 200
            _Contract.validate(response.json(), "RoomDetail")

        run_async(body)


class TestSittingDown:
    def test_the_first_seat_brings_the_starting_stack(self):
        room = make_room()  # big blind 2: 200 chips
        a, watcher = make_user("alice"), make_user("watcher")

        async def body():
            conn = await connect(room, watcher)
            client = await alogged_in(a)
            response = await apost(client, f"/api/rooms/{room.pk}/seats/", {"seat": 1})
            assert response.status_code == 201
            assert response.json()["stack"] == 200
            updates = by_type(await drain(conn), "seat.updated")
            assert [u["payload"]["occupant"]["stack"] for u in updates] == [200]

        run_async(body)
        assert grants(room, a) == [200]

    def test_two_players_sitting_down_get_a_hand_without_the_owner(self):
        room = make_room()
        a, b, watcher = make_user("alice"), make_user("bob"), make_user("watcher")

        async def body():
            conn = await connect(room, watcher)
            for user, n in ((a, 1), (b, 2)):
                client = await alogged_in(user)
                response = await apost(client, f"/api/rooms/{room.pk}/seats/", {"seat": n})
                assert response.status_code == 201
            assert by_type(await drain(conn), "hand.started")

        run_async(body)

    def test_sitting_down_again_keeps_the_chips_and_grants_nothing(self):
        room = make_room()
        a = make_user("alice")

        async def body():
            client = await alogged_in(a)
            await apost(client, f"/api/rooms/{room.pk}/seats/", {"seat": 1})
            assert (await client.delete(f"/api/rooms/{room.pk}/seats/me/")).status_code == 204
            again = await apost(client, f"/api/rooms/{room.pk}/seats/", {"seat": 3})
            assert again.status_code == 201
            assert again.json()["stack"] == 200

        run_async(body)
        assert grants(room, a) == [200]

    def test_someone_who_left_broke_sits_down_with_a_fresh_stack(self):
        room = make_room()
        a = make_user("alice")
        LedgerEntry.objects.create(room=room, user=a, kind="grant", amount=50)
        LedgerEntry.objects.create(room=room, user=a, kind="grant", amount=-50)

        async def body():
            client = await alogged_in(a)
            response = await apost(client, f"/api/rooms/{room.pk}/seats/", {"seat": 1})
            assert response.json()["stack"] == 200

        run_async(body)
        assert balance(room, a) == 200

    def test_a_failed_ledger_write_keeps_the_seat_without_chips(self, monkeypatch):
        room = make_room()
        a = make_user("alice")

        async def broken(**kwargs):
            raise RuntimeError("database gone")

        async def body():
            monkeypatch.setattr(LedgerEntry.objects, "acreate", broken)
            client = await alogged_in(a)
            response = await apost(client, f"/api/rooms/{room.pk}/seats/", {"seat": 1})
            assert response.status_code == 201
            assert response.json()["stack"] == 0
            table = await actor_module.get_actor(room.pk)
            assert table.session.ledger == []  # nothing in memory the database does not have

        run_async(body)
        assert grants(room, a) == []


class TestRebuy:
    def test_a_busted_player_buys_back_in(self):
        room, owner, a = owned_one_player()
        LedgerEntry.objects.create(room=room, user=a, kind="grant", amount=-CHIPS)

        async def body():
            watcher = await connect(room, owner)
            client = await alogged_in(a)
            response = await apost(client, f"/api/rooms/{room.pk}/rebuy/")
            assert response.status_code == 200
            assert response.json() == {"player_id": str(a.pk), "amount": 200, "balance": 200}
            _Contract.validate(response.json(), "GrantChipsResult")
            updates = by_type(await drain(watcher), "seat.updated")
            assert updates[-1]["payload"]["occupant"]["stack"] == 200

        run_async(body)
        assert balance(room, a) == 200
        assert grants(room, a)[-1] == 200
        assert not OwnerAction.objects.exists()  # the player's own buy-in, not an owner power

    def test_the_rebuy_uses_the_rooms_current_starting_stack(self):
        room = make_room(starting_stack=750)
        a = make_user("alice")
        busted(room, a, 1)

        async def body():
            client = await alogged_in(a)
            response = await apost(client, f"/api/rooms/{room.pk}/rebuy/")
            assert response.json()["balance"] == 750

        run_async(body)

    def test_a_rebuy_deals_a_hand_when_it_makes_two_players(self):
        room = make_room()
        a, b = make_user("alice"), make_user("bob")
        busted(room, a, 1)
        seat(room, b, 2)

        async def body():
            ca, cb = await connect(room, a), await connect(room, b)
            assert not by_type(await drain(ca), "hand.started")  # alone with chips: no hand
            client = await alogged_in(a)
            assert (await apost(client, f"/api/rooms/{room.pk}/rebuy/")).status_code == 200
            assert by_type(await drain(cb), "hand.started")

        run_async(body)

    def test_a_player_with_chips_cannot_rebuy(self):
        room = make_room()
        a = make_user("alice")
        seat(room, a, 1)

        async def body():
            client = await alogged_in(a)
            response = await apost(client, f"/api/rooms/{room.pk}/rebuy/")
            assert response.status_code == 409
            assert response.json()["code"] == "has_chips"
            _Contract.validate(response.json(), "ApiError")

        run_async(body)
        assert grants(room, a) == [CHIPS]

    def test_no_rebuy_during_the_players_hand(self):
        room, a, b = heads_up_room()

        async def body():
            await started_hand(await connect(room, a), await connect(room, b))
            client = await alogged_in(a)
            response = await apost(client, f"/api/rooms/{room.pk}/rebuy/")
            assert response.status_code == 409
            assert response.json()["code"] == "player_in_hand"

        run_async(body)

    def test_someone_not_seated_cannot_rebuy(self):
        room = make_room()
        a = make_user("alice")

        async def body():
            client = await alogged_in(a)
            response = await apost(client, f"/api/rooms/{room.pk}/rebuy/")
            assert response.status_code == 409
            assert response.json()["code"] == "not_seated"

        run_async(body)
        assert grants(room, a) == []

    def test_no_rebuy_in_a_closed_room(self):
        room = make_room(status=Room.Status.CLOSED)
        a = make_user("alice")
        busted(room, a, 1)

        async def body():
            client = await alogged_in(a)
            response = await apost(client, f"/api/rooms/{room.pk}/rebuy/")
            assert response.status_code == 409
            assert response.json()["code"] == "room_closed"

        run_async(body)

    def test_no_rebuy_in_a_suspended_room(self):
        room = make_room()
        a = make_user("alice")
        busted(room, a, 1)

        async def body():
            table = await actor_module.get_actor(room.pk)
            table.suspended = True
            client = await alogged_in(a)
            response = await apost(client, f"/api/rooms/{room.pk}/rebuy/")
            assert response.status_code == 409
            assert response.json()["code"] == "room_suspended"

        run_async(body)

    def test_someone_not_logged_in_gets_no_guest_made(self):
        room = make_room()
        before = User.objects.count()

        async def body():
            response = await apost(AsyncClient(), f"/api/rooms/{room.pk}/rebuy/")
            assert response.status_code == 409
            assert response.json()["code"] == "not_seated"

        run_async(body)
        assert User.objects.count() == before

    def test_only_post(self):
        room = make_room()
        a = make_user("alice")

        async def body():
            client = await alogged_in(a)
            assert (await client.get(f"/api/rooms/{room.pk}/rebuy/")).status_code == 405

        run_async(body)


class TestOlderRooms:
    def test_the_migration_gives_them_100_big_blinds(self):
        room = make_room(big_blind=10, starting_stack=7)  # 7: anything but the answer

        migration = importlib.import_module("apps.games.migrations.0016_room_starting_stack")
        migration.fill_in_starting_stack(django_apps, None)

        room.refresh_from_db()
        assert room.starting_stack == 1000

    def test_a_huge_big_blind_gets_the_cap(self):
        room = make_room(small_blind=1, big_blind=50_000_000, starting_stack=7)

        migration = importlib.import_module("apps.games.migrations.0016_room_starting_stack")
        migration.fill_in_starting_stack(django_apps, None)

        room.refresh_from_db()
        assert room.starting_stack == 10_000_000


class TestGuests:
    def test_a_guest_creates_a_room_and_sits_down_with_chips(self, settings):
        settings.GUESTS_ALLOWED = True  # playing from home again (scripts/play-online.sh)

        async def body():
            client = AsyncClient()
            guest = await apost(client, "/api/auth/guest/", {"username": "khach-ban"})
            assert guest.status_code == 201
            created = await apost(client, "/api/rooms/", ROOM)
            assert created.status_code == 201
            assert created.json()["is_owner"] is True
            room_id = created.json()["room"]["room_id"]
            sat = await apost(client, f"/api/rooms/{room_id}/seats/", {"seat": 1})
            assert sat.status_code == 201
            assert sat.json()["stack"] == 100 * ROOM["big_blind"]

        run_async(body)

    def test_an_account_staff_switched_off_stays_out(self, settings):
        settings.GUESTS_ALLOWED = True
        off = make_user("off")
        off.is_active = False
        off.save()
        client = logged_in(off)  # a session from before the switch
        response = post(client, "/api/rooms/", ROOM)
        assert response.status_code in (401, 403)
