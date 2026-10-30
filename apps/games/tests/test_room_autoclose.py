"""A room nobody sits in closes itself; the owner changes max_seats and is_private later.

Idle close (docs/api/ws-protocol.md, room.updated): with nobody seated (spectators do not count;
a seated player sitting out or with no chips does) for ROOM_IDLE_CLOSE_SECONDS (5 minutes), the
room closes exactly like the owner's close: room.updated with status "closed", gone from the
lobby, no seat taken any more, history and ledger kept. RoomInfo.closes_at says when; someone
sitting down first cancels it. Room.empty_since keeps it across restarts, and a sweep closes
rooms whose actor is not loaded. Tests shorten the time through TableActor.idle_close.
"""

import asyncio
from datetime import timedelta
from types import SimpleNamespace

import pytest
from django.db import DatabaseError, connection
from django.db.migrations.executor import MigrationExecutor
from django.test import Client
from django.utils import timezone

from apps.games import actor as actor_module
from apps.games.models import Hand, LedgerEntry, OwnerAction, Room, RoomSeat

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
    send_act,
    started_hand,
)
from .test_leave_after_hand import fold_to_the_end, leave
from .test_rooms import (  # noqa: F401
    ROOM,
    TestContract,
    _fresh_rate_limits,
    alogged_in,
    apatch,
    apost,
    logged_in,
    owned_heads_up,
    owned_one_player,
    post,
)
from .test_start_countdown import when

pytestmark = [pytest.mark.django_db(transaction=True)]


def idle(monkeypatch, seconds: float | None) -> None:
    monkeypatch.setattr(actor_module.TableActor, "idle_close", seconds)


def closes_at(messages: list[dict]) -> list[str | None]:
    """closes_at of every room.updated, in order."""
    return [m["payload"]["room"]["closes_at"] for m in by_type(messages, "room.updated")]


def statuses(messages: list[dict]) -> list[str]:
    return [m["payload"]["room"]["status"] for m in by_type(messages, "room.updated")]


def auto_closes(room: Room) -> list[OwnerAction]:
    return list(OwnerAction.objects.filter(room=room, kind=OwnerAction.Kind.AUTO_CLOSE))


def lobby_ids(client=None) -> list[int]:
    rows = (client or Client()).get("/api/rooms/").json()["rooms"]
    return [row["room"]["room_id"] for row in rows]


class TestIdleClose:
    def test_the_last_player_standing_up_closes_the_room_after_the_idle_time(self, monkeypatch):
        idle(monkeypatch, 0.5)
        room, owner, a = owned_one_player()
        ledger_before = LedgerEntry.objects.filter(room=room).count()

        async def body():
            watcher = await connect(room, owner)  # a spectator: does not keep the room open
            await drain(watcher)
            table = await actor_module.get_actor(room.pk)
            assert table._room_info()["closes_at"] is None  # alice is seated
            assert (await leave(a, room)).status_code == 204
            first = await drain(watcher, wait=0.2)
            assert closes_at(first)[-1] is not None
            assert statuses(first)[-1] == "open"
            left = when(closes_at(first)[-1]) - timezone.now()
            assert timedelta(0) < left <= timedelta(seconds=0.5)
            later = await drain(watcher, wait=0.6)
            assert statuses(later)[-1] == "closed"
            assert closes_at(later)[-1] is None
            # Closed like the owner's close: nobody sits down any more.
            again = await apost(await alogged_in(a), f"/api/rooms/{room.pk}/seats/", {"seat": 2})
            assert again.status_code == 409 and again.json()["code"] == "room_closed"

        run_async(body)
        room.refresh_from_db()
        assert room.status == Room.Status.CLOSED and room.closing is False
        assert room.pk not in lobby_ids()
        assert LedgerEntry.objects.filter(room=room).count() == ledger_before  # kept
        [entry] = auto_closes(room)
        assert entry.user is None and entry.by_staff is False
        assert entry.details["idle_seconds"] == 0.5
        assert when(entry.details["empty_since"]) < timezone.now()
        assert room.empty_since is None  # closed: cleared

    def test_sitting_down_in_time_cancels_it(self, monkeypatch):
        idle(monkeypatch, 0.5)
        room, owner, a = owned_one_player()
        bob = make_user("bob")

        async def body():
            watcher = await connect(room, owner)
            await drain(watcher)
            await leave(a, room)
            await asyncio.sleep(0.2)
            sat = await apost(await alogged_in(bob), f"/api/rooms/{room.pk}/seats/", {"seat": 3})
            assert sat.status_code == 201
            messages = await drain(watcher, wait=0.8)  # past the first spell's end
            assert closes_at(messages)[-1] is None
            assert "closed" not in statuses(messages)
            assert (await actor_module.get_actor(room.pk)).closed is False

        run_async(body)
        room.refresh_from_db()
        assert room.status == Room.Status.OPEN and room.empty_since is None
        assert auto_closes(room) == []

    def test_a_new_spell_starts_the_time_over(self, monkeypatch):
        """Empty, someone sits, empty again: the old timer is void (epoch), the new one counts."""
        idle(monkeypatch, 0.6)
        room, owner, a = owned_one_player()

        async def body():
            watcher = await connect(room, owner)
            await leave(a, room)
            await asyncio.sleep(0.4)
            await apost(await alogged_in(a), f"/api/rooms/{room.pk}/seats/", {"seat": 1})
            await leave(a, room)
            await drain(watcher, wait=0.4)  # 0.8 s after the first leave: still open
            assert (await actor_module.get_actor(room.pk)).closed is False
            assert statuses(await drain(watcher, wait=0.5))[-1] == "closed"

        run_async(body)
        assert len(auto_closes(room)) == 1

    def test_a_kick_of_the_last_player_starts_it(self, monkeypatch):
        idle(monkeypatch, 0.3)
        room, owner, a = owned_one_player()

        async def body():
            watcher = await connect(room, owner)
            await drain(watcher)
            kick = await apost(
                await alogged_in(owner), f"/api/rooms/{room.pk}/kick/", {"player_id": str(a.pk)}
            )
            assert kick.status_code == 204
            assert statuses(await drain(watcher, wait=0.6))[-1] == "closed"

        run_async(body)
        room.refresh_from_db()
        assert room.status == Room.Status.CLOSED

    def test_players_leaving_after_the_hand_start_it_when_it_ends(self, monkeypatch):
        idle(monkeypatch, 0.3)
        room, owner, a, b = owned_heads_up()

        async def body():
            ca, cb = await connect(room, a), await connect(room, b)
            started, _ = await started_hand(ca, cb)
            watcher = await connect(room, owner)
            assert (await leave(a, room)).status_code == 202
            assert (await leave(b, room)).status_code == 202
            await drain(watcher, wait=0.5)
            # Still seated (leaving) while the hand runs: no idle close, whatever the time.
            table = await actor_module.get_actor(room.pk)
            assert table.closed is False and table._room_info()["closes_at"] is None
            await fold_to_the_end(room, {str(a.pk): ca, str(b.pk): cb}, started["hand_id"])
            messages = await drain(watcher, wait=0.6)
            assert by_type(messages, "hand.completed")
            assert statuses(messages)[-1] == "closed"
            assert not by_type(messages, "hand.started")

        run_async(body)
        assert Hand.objects.filter(room=room, completed_at__isnull=False).count() == 1  # kept
        assert not RoomSeat.objects.filter(room=room).exists()

    def test_sitting_out_and_busted_players_keep_the_room_open(self, monkeypatch):
        idle(monkeypatch, 0)
        room = make_room(empty_since=timezone.now() - timedelta(hours=1))  # stale: seated
        a, b = make_user("alice"), make_user("bob")
        RoomSeat.objects.create(room=room, user=a, seat=1, sitting_out=True)
        RoomSeat.objects.create(room=room, user=b, seat=2)  # no chips at all

        async def body():
            assert await actor_module.sweep_idle_rooms() == 0
            table = await actor_module.get_actor(room.pk)
            assert await table.close_if_idle() is False  # queued behind its start
            assert table.closed is False and table._room_info()["closes_at"] is None

        run_async(body)
        room.refresh_from_db()
        assert room.status == Room.Status.OPEN and room.empty_since is None

    def test_a_suspended_room_is_left_for_an_admin(self, monkeypatch):
        idle(monkeypatch, 60)
        room = make_room()

        async def body():
            table = await actor_module.get_actor(room.pk)
            await asyncio.sleep(0.05)
            table.suspended = True  # as _fail_stop leaves it
            past = timezone.now() - timedelta(hours=1)
            table.room.empty_since = past
            await Room.objects.filter(pk=room.pk).aupdate(empty_since=past)
            assert await table.close_if_idle() is False
            assert await actor_module.sweep_idle_rooms() == 0
            assert table._room_info()["closes_at"] is None

        run_async(body)
        room.refresh_from_db()
        assert room.status == Room.Status.OPEN

    def test_nobody_seated_and_no_time_to_wait_closes_at_the_start(self, monkeypatch):
        idle(monkeypatch, 0)
        room = make_room()

        async def body():
            table = await actor_module.get_actor(room.pk)
            await asyncio.sleep(0.05)
            assert table.closed

        run_async(body)
        assert len(auto_closes(room)) == 1

    def test_the_owners_close_cancels_the_timer(self, monkeypatch):
        idle(monkeypatch, 0.3)
        room, owner, a = owned_one_player()

        async def body():
            watcher = await connect(room, owner)
            await leave(a, room)
            closed = await apost(await alogged_in(owner), f"/api/rooms/{room.pk}/close/")
            assert closed.status_code == 200
            await drain(watcher, wait=0.5)

        run_async(body)
        assert auto_closes(room) == []  # the owner closed it, not the server
        assert OwnerAction.objects.filter(room=room, kind=OwnerAction.Kind.CLOSE).count() == 1


class TestNoActorLoaded:
    def test_a_new_room_says_when_it_closes(self):
        client = logged_in(make_user("an"))
        before = timezone.now()
        detail = post(client, "/api/rooms/", ROOM).json()
        left = when(detail["room"]["closes_at"]) - before
        assert timedelta(seconds=299) < left <= timedelta(seconds=301)  # 5 minutes, for real
        [row] = client.get("/api/rooms/").json()["rooms"]
        assert row["room"]["closes_at"] == detail["room"]["closes_at"]
        assert actor_module.ROOM_IDLE_CLOSE_SECONDS == 300

    def test_the_sweep_closes_a_room_nobody_ever_opened(self, monkeypatch):
        client = logged_in(make_user("an"))
        room_id = post(client, "/api/rooms/", ROOM).json()["room"]["room_id"]
        Room.objects.filter(pk=room_id).update(empty_since=timezone.now() - timedelta(minutes=6))
        assert room_id not in lobby_ids(client)  # past due: as good as closed already
        assert room_id not in actor_module._actors

        async def body():
            assert await actor_module.sweep_idle_rooms() == 1
            assert await actor_module.sweep_idle_rooms() == 0  # closed: not looked at again

        run_async(body)
        room = Room.objects.get(pk=room_id)
        assert room.status == Room.Status.CLOSED
        assert len(auto_closes(room)) == 1
        assert client.get(f"/api/rooms/{room_id}/").json()["room"]["status"] == "closed"
        assert client.get(f"/api/rooms/{room_id}/").json()["room"]["closes_at"] is None

    def test_the_sweep_leaves_rooms_with_time_left(self):
        fresh = make_room()  # empty_since: now
        seated, a, b = heads_up_room(empty_since=None)

        async def body():
            assert await actor_module.sweep_idle_rooms() == 0
            assert fresh.pk not in actor_module._actors  # nothing loaded for nothing

        run_async(body)
        assert Room.objects.filter(status=Room.Status.OPEN).count() == 2

    def test_after_a_restart_the_spell_goes_on(self, monkeypatch):
        """The time counts from empty_since in the database, not from the actor's start."""
        since = timezone.now() - timedelta(seconds=200)
        room = make_room(empty_since=since)

        async def body():
            table = await actor_module.get_actor(room.pk)
            assert table._closes_at() == since + timedelta(seconds=300)
            assert table.closed is False

        run_async(body)

    def test_past_due_at_restart_it_closes_before_a_seat_is_taken(self):
        room = make_room(empty_since=timezone.now() - timedelta(minutes=10))
        a = make_user("alice")

        async def body():
            # The seat request is queued the moment the actor exists, before its start runs.
            response = await apost(await alogged_in(a), f"/api/rooms/{room.pk}/seats/", {"seat": 1})
            assert response.status_code == 409 and response.json()["code"] == "room_closed"

        run_async(body)
        room.refresh_from_db()
        assert room.status == Room.Status.CLOSED
        assert not RoomSeat.objects.filter(room=room).exists()

    def test_an_actor_for_an_empty_room_without_empty_since_starts_the_spell(self):
        room = make_room(empty_since=None)  # say, made by an ops command

        async def body():
            table = await actor_module.get_actor(room.pk)
            await asyncio.sleep(0.05)
            assert table._room_info()["closes_at"] is not None

        run_async(body)
        room.refresh_from_db()
        assert room.empty_since is not None

    def test_the_asgi_application_starts_the_sweep_once(self):
        from channels.testing import HttpCommunicator

        from config.asgi import application

        async def body():
            for _ in range(2):
                await HttpCommunicator(application, "GET", "/api/rooms/").get_response()
            sweeper = actor_module._sweeper
            assert sweeper is not None and not sweeper.done()
            await HttpCommunicator(application, "GET", "/api/rooms/").get_response()
            assert actor_module._sweeper is sweeper

        run_async(body)
        assert actor_module._sweeper is None  # stopped with the actors


class TestIdleSetting:
    def test_the_setting_and_the_override(self, settings, monkeypatch):
        idle(monkeypatch, None)
        settings.ROOM_IDLE_CLOSE_SECONDS = None
        assert actor_module.idle_close_seconds() == 300
        settings.ROOM_IDLE_CLOSE_SECONDS = 7.0
        assert actor_module.idle_close_seconds() == 7.0
        idle(monkeypatch, 0.5)
        assert actor_module.idle_close_seconds() == 0.5


class TestMigration:
    def test_0022_starts_the_clock_for_empty_open_rooms_only(self):
        executor = MigrationExecutor(connection)
        executor.migrate([("games", "0021_owneraction_start_pause")])
        old = executor.loader.project_state([("games", "0021_owneraction_start_pause")]).apps
        OldRoom, OldSeat = old.get_model("games", "Room"), old.get_model("games", "RoomSeat")
        OldUser = old.get_model("games", "User")
        common = {"small_blind": 1, "big_blind": 2, "starting_stack": 200}
        empty = OldRoom.objects.create(name="empty", **common)
        seated = OldRoom.objects.create(name="seated", **common)
        closed = OldRoom.objects.create(name="closed", status="closed", **common)
        user = OldUser.objects.create(username="u")
        OldSeat.objects.create(room=seated, user=user, seat=1)
        before = timezone.now()

        executor = MigrationExecutor(connection)
        executor.loader.build_graph()
        executor.migrate(executor.loader.graph.leaf_nodes())
        assert Room.objects.get(pk=empty.pk).empty_since >= before
        assert Room.objects.get(pk=seated.pk).empty_since is None
        assert Room.objects.get(pk=closed.pk).empty_since is None


class TestOwnerChangesSeatsAndPrivacy:
    def test_max_seats_between_hands_applies_now(self):
        room, owner, a = owned_one_player()  # alice on seat 1
        bob = make_user("bob")

        async def body():
            watcher = await connect(room, owner)
            await drain(watcher)
            client = await alogged_in(owner)
            response = await apatch(client, f"/api/rooms/{room.pk}/", {"max_seats": 4})
            assert response.status_code == 200
            assert response.json()["room"]["max_seats"] == 4
            assert response.json()["pending"] is None
            assert (
                by_type(await drain(watcher), "room.updated")[-1]["payload"]["room"]["max_seats"]
                == 4
            )
            late = await alogged_in(bob)
            far = await apost(late, f"/api/rooms/{room.pk}/seats/", {"seat": 5})
            assert far.status_code == 400 and far.json()["code"] == "invalid_seat"
            near = await apost(late, f"/api/rooms/{room.pk}/seats/", {"seat": 4})
            assert near.status_code == 201
            more = await apatch(client, f"/api/rooms/{room.pk}/", {"max_seats": 9})
            assert more.json()["room"]["max_seats"] == 9

        run_async(body)
        room.refresh_from_db()
        assert room.max_seats == 9
        logged = OwnerAction.objects.filter(room=room, kind=OwnerAction.Kind.SETTINGS)
        assert [entry.details for entry in logged.order_by("id")] == [
            {"max_seats": 4},
            {"max_seats": 9},
        ]

    def test_max_seats_cannot_go_below_a_taken_seat(self):
        room, owner, a = owned_one_player()
        RoomSeat.objects.filter(room=room, user=a).update(seat=6)

        async def body():
            client = await alogged_in(owner)
            response = await apatch(client, f"/api/rooms/{room.pk}/", {"max_seats": 5})
            assert response.status_code == 400
            assert response.json()["code"] == "validation_error"
            assert list(response.json()["fields"]) == ["max_seats"]
            ok = await apatch(client, f"/api/rooms/{room.pk}/", {"max_seats": 6})
            assert ok.status_code == 200 and ok.json()["room"]["max_seats"] == 6

        run_async(body)
        room.refresh_from_db()
        assert room.max_seats == 6

    def test_max_seats_and_is_private_are_checked_like_on_create(self):
        room, owner, a = owned_one_player()

        async def body():
            client = await alogged_in(owner)
            for body in ({"max_seats": 1}, {"max_seats": 10}, {"max_seats": "6"}):
                response = await apatch(client, f"/api/rooms/{room.pk}/", body)
                assert response.status_code == 400, body
                assert list(response.json()["fields"]) == ["max_seats"]
            response = await apatch(client, f"/api/rooms/{room.pk}/", {"is_private": 1})
            assert response.status_code == 400
            assert list(response.json()["fields"]) == ["is_private"]

        run_async(body)
        room.refresh_from_db()
        assert (room.max_seats, room.is_private) == (9, False)

    def test_during_a_hand_they_apply_at_once_and_the_rest_waits(self):
        room, owner, a, b = owned_heads_up()

        async def body():
            ca, cb = await connect(room, a), await connect(room, b)
            await started_hand(ca, cb)
            client = await alogged_in(owner)
            response = await apatch(
                client,
                f"/api/rooms/{room.pk}/",
                {"max_seats": 3, "is_private": True, "big_blind": 6},
            )
            assert response.status_code == 200
            detail = response.json()
            assert detail["room"]["max_seats"] == 3 and detail["is_private"] is True
            assert detail["room"]["status"] == "playing"
            assert detail["pending"] == {"big_blind": 6}
            assert detail["room"]["big_blind"] == 2
            updated = by_type(await drain(ca), "room.updated")
            assert updated[-1]["payload"]["room"]["max_seats"] == 3
            assert not by_type(await drain(ca), "hand.completed")  # the hand goes on
            table = await actor_module.get_actor(room.pk)
            assert table.session.max_seats == 3 and table.hand is not None

        run_async(body)
        room.refresh_from_db()
        assert (room.max_seats, room.is_private, room.big_blind) == (3, True, 2)
        assert room.pending_settings == {"big_blind": 6}

    def test_is_private_hides_the_room_from_the_lobby_at_once(self):
        room, owner, a = owned_one_player()
        room.invite_token = "invite-token-for-test"
        room.save()
        outsider = logged_in(make_user("outsider"))
        assert room.pk in lobby_ids(outsider)

        async def body():
            client = await alogged_in(owner)
            response = await apatch(client, f"/api/rooms/{room.pk}/", {"is_private": True})
            assert response.status_code == 200 and response.json()["is_private"] is True

        run_async(body)
        assert room.pk not in lobby_ids(outsider)
        assert outsider.get(f"/api/rooms/{room.pk}/").json()["code"] == "room_not_found"
        assert room.pk in lobby_ids(logged_in(owner))  # the owner still sees it
        assert logged_in(a).get(f"/api/rooms/{room.pk}/").status_code == 200  # seated

        async def back():
            client = await alogged_in(owner)
            response = await apatch(client, f"/api/rooms/{room.pk}/", {"is_private": False})
            assert response.json()["is_private"] is False

        run_async(back)
        assert room.pk in lobby_ids(outsider)

    def test_responses_match_the_contract(self, monkeypatch):
        idle(monkeypatch, 60)
        room, owner, a = owned_one_player()

        async def body():
            client = await alogged_in(owner)
            response = await apatch(client, f"/api/rooms/{room.pk}/", {"max_seats": 6})
            TestContract.validate(response.json(), "RoomDetail")
            await leave(a, room)
            detail = (await client.get(f"/api/rooms/{room.pk}/")).json()
            assert detail["room"]["closes_at"] is not None
            TestContract.validate(detail, "RoomDetail")
            TestContract.validate({"max_seats": 6, "is_private": True}, "UpdateRoomRequest")

        run_async(body)


class TestReviewFixes:
    """Review of the first version: the sweep never hangs or hoards actors, settings stay sane."""

    def test_a_hung_actor_does_not_stop_the_sweep(self, monkeypatch, caplog):
        idle(monkeypatch, 60)
        monkeypatch.setattr(actor_module, "IDLE_SWEEP_ACTOR_TIMEOUT", 0.2)
        past = timezone.now() - timedelta(hours=1)
        hung = make_room()  # swept first (lower pk)
        other = make_room(empty_since=past)

        async def body():
            table = await actor_module.get_actor(hung.pk)
            await asyncio.sleep(0.05)
            await Room.objects.filter(pk=hung.pk).aupdate(empty_since=past)
            release = asyncio.Event()

            async def stuck():
                await release.wait()

            busy = asyncio.ensure_future(table._call(stuck))
            assert await actor_module.sweep_idle_rooms() == 1  # the other room
            release.set()
            await busy
            # The sweep gave up on its question; the actor still answers the next one.
            assert await asyncio.wait_for(table.close_if_idle(), 1) is False

        run_async(body)
        assert "no answer to the idle sweep" in caplog.text
        assert Room.objects.get(pk=other.pk).status == Room.Status.CLOSED
        assert Room.objects.get(pk=hung.pk).status == Room.Status.OPEN

    def test_a_dead_actor_does_not_stop_the_sweep(self, monkeypatch, caplog):
        idle(monkeypatch, 60)
        past = timezone.now() - timedelta(hours=1)
        dead, other = make_room(), make_room(empty_since=past)

        async def body():
            table = await actor_module.get_actor(dead.pk)
            await asyncio.sleep(0.05)
            await Room.objects.filter(pk=dead.pk).aupdate(empty_since=past)
            table._task.cancel()
            await asyncio.sleep(0)
            assert await asyncio.wait_for(actor_module.sweep_idle_rooms(), 2) == 1

        run_async(body)
        assert "has stopped; not swept" in caplog.text
        assert Room.objects.get(pk=other.pk).status == Room.Status.CLOSED

    def test_a_failing_start_does_not_kill_the_actor(self, monkeypatch, caplog):
        room = make_room()

        async def broken(self, pause=True):
            raise RuntimeError("boom")

        monkeypatch.setattr(actor_module.TableActor, "_between_hands", broken)

        async def body():
            table = await actor_module.get_actor(room.pk)
            assert await asyncio.wait_for(table.close_if_idle(), 1) is False
            assert not table._task.done()

        run_async(body)
        assert "resuming the table failed" in caplog.text

    def test_the_sweep_loop_survives_a_failing_sweep(self, monkeypatch):
        idle(monkeypatch, 0)
        monkeypatch.setattr(actor_module, "IDLE_SWEEP_SECONDS", 0.05)
        calls = []

        async def flaky():
            calls.append(1)
            if len(calls) == 1:
                raise DatabaseError("down")
            return 0

        monkeypatch.setattr(actor_module, "sweep_idle_rooms", flaky)

        async def body():
            actor_module.start_idle_sweeper()
            await asyncio.sleep(0.3)
            assert len(calls) >= 2
            assert not actor_module._sweeper.done()

        run_async(body)

    def test_an_unloaded_room_is_closed_without_loading_its_actor(self):
        past = timezone.now() - timedelta(minutes=6)
        room = make_room(empty_since=past)
        busy = make_room(empty_since=past)  # an unfinished hand, nobody seated: left alone
        Hand.objects.create(room=busy, hand_no=1, button_seat=1, config={})

        async def body():
            assert await actor_module.sweep_idle_rooms() == 1
            assert actor_module._actors == {}

        run_async(body)
        room.refresh_from_db()
        assert room.status == Room.Status.CLOSED and room.empty_since is None
        [entry] = auto_closes(room)
        assert entry.user is None and entry.details["idle_seconds"] == 300
        assert Room.objects.get(pk=busy.pk).status == Room.Status.OPEN
        assert auto_closes(busy) == []

    def test_a_failed_max_seats_save_is_not_left_pending(self, monkeypatch):
        room, owner, a = owned_one_player()
        bob = make_user("bob")

        async def body():
            table = await actor_module.get_actor(room.pk)
            await asyncio.sleep(0.05)
            original = Room.asave

            async def broken(self, *args, **kwargs):
                raise DatabaseError("down")

            monkeypatch.setattr(Room, "asave", broken)
            with pytest.raises(DatabaseError):
                await table.update_settings({"max_seats": 4})
            monkeypatch.setattr(Room, "asave", original)
            assert "max_seats" not in table.pending
            assert table.room.max_seats == 9 and table.session.max_seats == 9
            sat = await apost(await alogged_in(bob), f"/api/rooms/{room.pk}/seats/", {"seat": 6})
            assert sat.status_code == 201
            client = await alogged_in(owner)
            later = await apatch(client, f"/api/rooms/{room.pk}/", {"name": "Still fine"})
            assert later.status_code == 200
            # Whatever is pending counts too: never a max_seats below a taken seat.
            table.pending["max_seats"] = 4
            bad = await apatch(client, f"/api/rooms/{room.pk}/", {"name": "Again"})
            assert bad.status_code == 400 and list(bad.json()["fields"]) == ["max_seats"]
            table.pending.clear()

        run_async(body)
        room.refresh_from_db()
        assert (room.name, room.max_seats) == ("Still fine", 9)

    def test_a_failed_save_leaves_nothing_pending(self, monkeypatch):
        room, owner, a = owned_one_player()

        async def body():
            table = await actor_module.get_actor(room.pk)
            await asyncio.sleep(0.05)

            async def broken(self, *args, **kwargs):
                raise DatabaseError("down")

            monkeypatch.setattr(Room, "asave", broken)
            with pytest.raises(DatabaseError):
                await table.update_settings({"think_time_seconds": 45, "max_seats": 4})
            assert table.pending == {}
            assert table.room.pending_settings == {}
            assert (table.room.think_time_seconds, table.room.max_seats) == (30, 9)

        run_async(body)

    def test_a_hand_that_cannot_be_resumed_suspends_the_room(self, monkeypatch, caplog):
        room = make_room()

        async def broken(self):
            self.hand = SimpleNamespace(pk=987654)
            raise RuntimeError("no turn clock")

        monkeypatch.setattr(actor_module.TableActor, "_resume", broken)

        async def body():
            table = await actor_module.get_actor(room.pk)
            await asyncio.sleep(0.05)
            assert table.suspended
            assert not table._task.done()

        run_async(body)
        assert "resuming the hand failed" in caplog.text

    def test_no_settings_change_on_a_room_closed_when_its_actor_loaded(self):
        room, owner, a = owned_one_player()
        RoomSeat.objects.filter(room=room).delete()
        Room.objects.filter(pk=room.pk).update(empty_since=timezone.now() - timedelta(hours=1))

        async def body():
            client = await alogged_in(owner)
            response = await apatch(client, f"/api/rooms/{room.pk}/", {"name": "Late"})
            assert response.status_code == 409 and response.json()["code"] == "room_closed"

        run_async(body)
        room.refresh_from_db()
        assert room.status == Room.Status.CLOSED and room.name == "T"
        kinds = list(OwnerAction.objects.filter(room=room).values_list("kind", flat=True))
        assert kinds == [OwnerAction.Kind.AUTO_CLOSE]

    def test_closing_during_a_hand_announces_no_idle_close(self, monkeypatch):
        idle(monkeypatch, 60)
        room, owner, a, b = owned_heads_up()

        async def body():
            ca, cb = await connect(room, a), await connect(room, b)
            started, _ = await started_hand(ca, cb)
            watcher = await connect(room, owner)
            await leave(a, room)
            await leave(b, room)
            closed = await apost(await alogged_in(owner), f"/api/rooms/{room.pk}/close/")
            assert closed.status_code == 202
            await drain(watcher)
            await fold_to_the_end(room, {str(a.pk): ca, str(b.pk): cb}, started["hand_id"])
            messages = await drain(watcher, wait=0.5)
            assert statuses(messages)[-1] == "closed"
            assert set(closes_at(messages)) == {None}

        run_async(body)
        room.refresh_from_db()
        assert room.status == Room.Status.CLOSED and room.empty_since is None
        assert auto_closes(room) == []

    def test_any_close_clears_empty_since(self, monkeypatch):
        idle(monkeypatch, 60)
        room, owner, a = owned_one_player()

        async def body():
            await leave(a, room)
            assert (await Room.objects.aget(pk=room.pk)).empty_since is not None
            closed = await apost(await alogged_in(owner), f"/api/rooms/{room.pk}/close/")
            assert closed.status_code == 200

        run_async(body)
        room.refresh_from_db()
        assert room.status == Room.Status.CLOSED and room.empty_since is None
