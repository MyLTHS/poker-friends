"""Start, countdown, pause between hands, Pause (docs/api/ws-protocol.md "Bắt đầu, đếm ngược").

A new room is paused: nothing is dealt until the owner presses Start. Then the table counts
START_COUNTDOWN_SECONDS down before the first hand, and pauses hand_pause_seconds between hands.
Tests shorten the countdowns through TableActor.start_countdown / next_hand_delay.
"""

import asyncio
from datetime import datetime

import pytest
from django.db import DatabaseError, IntegrityError

from apps.games import actor as actor_module
from apps.games.models import Hand, OwnerAction, Room, RoomSeat

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
from .test_rooms import ROOM, _fresh_rate_limits, alogged_in, apatch, apost, logged_in, post  # noqa: F401

pytestmark = [pytest.mark.django_db(transaction=True)]


def when(text: str) -> datetime:
    return datetime.fromisoformat(text.replace("Z", "+00:00"))


def paused_room(**kwargs) -> tuple[Room, object, object, object]:
    """A paused room with an owner (watching, not seated) and two funded players."""
    room = make_room(running=False, **kwargs)
    owner, a, b = make_user("owner"), make_user("alice"), make_user("bob")
    room.owner = owner
    room.save()
    seat(room, a, 1)
    seat(room, b, 2)
    return room, owner, a, b


def countdown(monkeypatch, seconds: float) -> None:
    monkeypatch.setattr(actor_module.TableActor, "start_countdown", seconds)


def countdowns(messages: list[dict]) -> list[dict]:
    """The room.updated events that announce a deal (next_hand_at set)."""
    return [m for m in by_type(messages, "room.updated") if m["payload"]["room"]["next_hand_at"]]


class TestStartAndPause:
    def test_a_new_room_is_paused_and_deals_nothing(self):
        detail = post(logged_in(make_user("an")), "/api/rooms/", ROOM).json()
        assert detail["room"]["running"] is False
        assert detail["room"]["next_hand_at"] is None
        assert detail["room"]["hand_pause_seconds"] == 10

        room, owner, a, b = paused_room()

        async def body():
            ca, cb = await connect(room, a), await connect(room, b)
            assert not by_type(await drain(ca, wait=0.4), "hand.started")
            await drain(cb)

        run_async(body)

    def test_start_counts_down_then_deals(self, monkeypatch):
        countdown(monkeypatch, 0.5)
        room, owner, a, b = paused_room()

        async def body():
            ca, cb = await connect(room, a), await connect(room, b)
            await drain(ca)
            client = await alogged_in(owner)
            response = await apost(client, f"/api/rooms/{room.pk}/start/")
            assert response.status_code == 200
            info = response.json()
            assert info["running"] is True and info["next_hand_at"] is not None
            early = await drain(ca, wait=0.2)
            assert by_type(early, "room.updated")[-1]["payload"]["room"]["next_hand_at"]
            assert not by_type(early, "hand.started")  # still counting down
            later = await drain(ca, wait=0.6)
            assert by_type(later, "hand.started")
            await drain(cb)

        run_async(body)
        room.refresh_from_db()
        assert room.running is True

    def test_the_real_countdown_is_ten_seconds(self, monkeypatch):
        countdown(monkeypatch, None)
        room, owner, a, b = paused_room()

        async def body():
            await connect(room, a)
            await connect(room, b)
            info = (await apost(await alogged_in(owner), f"/api/rooms/{room.pk}/start/")).json()
            table = await actor_module.get_actor(room.pk)
            left = (when(info["next_hand_at"]) - table._next_hand_at).total_seconds()
            assert abs(left) < 0.01  # what clients see is what is scheduled
            assert actor_module.START_COUNTDOWN_SECONDS == 10
            ahead = (table._next_hand_at - datetime.now(table._next_hand_at.tzinfo)).total_seconds()
            assert 9 < ahead <= 10

        run_async(body)

    def test_only_the_owner_starts_and_pauses(self):
        room, owner, a, b = paused_room()

        async def body():
            for path in ("start", "pause"):
                response = await apost(await alogged_in(a), f"/api/rooms/{room.pk}/{path}/")
                assert response.status_code == 403
                assert response.json()["code"] == "forbidden"
            from django.test import AsyncClient

            anonymous = await apost(AsyncClient(), f"/api/rooms/{room.pk}/start/")
            assert anonymous.status_code == 401

        run_async(body)
        room.refresh_from_db()
        assert room.running is False

    def test_start_and_pause_twice_change_nothing_the_second_time(self, monkeypatch):
        countdown(monkeypatch, 30)
        room, owner, a, b = paused_room()

        async def body():
            watcher = await connect(room, owner)
            await connect(room, a)
            await connect(room, b)
            await drain(watcher)
            client = await alogged_in(owner)
            first = (await apost(client, f"/api/rooms/{room.pk}/start/")).json()
            second = (await apost(client, f"/api/rooms/{room.pk}/start/")).json()
            assert second == first  # the same countdown, not a new one
            assert len(by_type(await drain(watcher), "room.updated")) == 1
            paused = (await apost(client, f"/api/rooms/{room.pk}/pause/")).json()
            again = (await apost(client, f"/api/rooms/{room.pk}/pause/")).json()
            assert paused == again
            assert (paused["running"], paused["next_hand_at"]) == (False, None)
            assert len(by_type(await drain(watcher), "room.updated")) == 1

        run_async(body)

    def test_pause_during_the_countdown_deals_nothing_even_when_the_old_timer_fires(
        self, monkeypatch
    ):
        countdown(monkeypatch, 0.3)
        room, owner, a, b = paused_room()

        async def body():
            ca = await connect(room, a)
            await connect(room, b)
            client = await alogged_in(owner)
            await apost(client, f"/api/rooms/{room.pk}/start/")
            await apost(client, f"/api/rooms/{room.pk}/pause/")
            messages = await drain(ca, wait=0.6)
            assert not by_type(messages, "hand.started")
            assert by_type(messages, "room.updated")[-1]["payload"]["room"]["running"] is False
            # Start again: the old timer is void, the new countdown deals exactly one hand.
            await apost(client, f"/api/rooms/{room.pk}/start/")
            await apost(client, f"/api/rooms/{room.pk}/pause/")
            await apost(client, f"/api/rooms/{room.pk}/start/")
            assert len(by_type(await drain(ca, wait=0.8), "hand.started")) == 1

        run_async(body)

    def test_a_timer_that_fires_while_the_table_is_busy_never_deals_after_pause_and_start(
        self, monkeypatch
    ):
        # Start's 0.2 s timer fires while the table is busy, so its _StartHand waits in the queue
        # behind a Pause and a new Start (5 s): only the epoch tells it is void.
        countdown(monkeypatch, 0.2)
        room, owner, a, b = paused_room()
        handled = []  # (the timer's epoch, the table's epoch) for each _StartHand handled
        real_on_start_hand = actor_module.TableActor._on_start_hand

        async def on_start_hand(self, item):
            handled.append((item.epoch, self._deal_epoch))
            await real_on_start_hand(self, item)

        monkeypatch.setattr(actor_module.TableActor, "_on_start_hand", on_start_hand)

        async def body():
            ca = await connect(room, a)
            await connect(room, b)
            table = await actor_module.get_actor(room.pk)
            await table.start()  # deals in 0.2 s
            busy = asyncio.get_running_loop().create_future()
            table._queue.put_nowait(actor_module._Call(lambda: asyncio.sleep(0.4), busy))
            countdown(monkeypatch, 5)
            await asyncio.gather(table.pause(), table.start(), busy)
            assert not by_type(await drain(ca, wait=1.0), "hand.started")
            # The old timer did fire, after the new Start: there was something to ignore.
            assert [timer for timer, now in handled if timer != now]
            assert table._next_hand_at is not None  # the new 5 s countdown still runs

        run_async(body)

    def test_start_on_a_running_room_counts_down_when_nothing_is_scheduled(self, monkeypatch):
        countdown(monkeypatch, 30)
        room, owner, a, b = paused_room()

        async def body():
            ca = await connect(room, a)
            await connect(room, b)
            client = await alogged_in(owner)
            await apost(client, f"/api/rooms/{room.pk}/start/")
            table = await actor_module.get_actor(room.pk)

            async def lose_the_countdown():
                table._cancel_deal()  # whatever went wrong: running, ready, nothing scheduled

            await table._call(lose_the_countdown)
            await drain(ca)
            countdown(monkeypatch, 0.2)
            info = (await apost(client, f"/api/rooms/{room.pk}/start/")).json()
            assert info["running"] is True and info["next_hand_at"] is not None
            messages = await drain(ca, wait=0.6)
            assert countdowns(messages) and by_type(messages, "hand.started")

        run_async(body)

    def test_start_and_pause_are_in_the_owner_log_when_they_change_something(self, monkeypatch):
        countdown(monkeypatch, 30)
        room, owner, a, b = paused_room()
        staff = make_user("admin")
        staff.is_staff = staff.is_superuser = True
        staff.save()

        async def body():
            mine, theirs = await alogged_in(owner), await alogged_in(staff)
            for client, path in (
                (mine, "start"),
                (mine, "start"),  # running already: nothing changes, nothing logged
                (mine, "pause"),
                (mine, "pause"),
                (theirs, "start"),
            ):
                response = await apost(client, f"/api/rooms/{room.pk}/{path}/")
                assert response.status_code == 200, path

        run_async(body)
        log = OwnerAction.objects.filter(room=room).order_by("id")
        assert list(log.values_list("user_id", "by_staff", "kind", "details")) == [
            (owner.pk, False, "start", {}),
            (owner.pk, False, "pause", {}),
            (staff.pk, True, "start", {}),
        ]
        page = logged_in(staff).get("/admin/games/owneraction/")
        assert page.status_code == 200
        assert "Start room" in page.content.decode() and "Pause room" in page.content.decode()

    def test_a_closed_room_cannot_start(self):
        room, owner, a, b = paused_room(status=Room.Status.CLOSED)

        async def body():
            response = await apost(await alogged_in(owner), f"/api/rooms/{room.pk}/start/")
            assert response.status_code == 409
            assert response.json()["code"] == "room_closed"

        run_async(body)


class TestWhenToDeal:
    def test_running_without_two_players_waits_then_counts_down_for_the_second(self, monkeypatch):
        countdown(monkeypatch, 0.3)
        room = make_room(running=False)
        owner, a, b = make_user("owner"), make_user("alice"), make_user("bob")
        room.owner = owner
        room.save()
        seat(room, a, 1)

        async def body():
            watcher = await connect(room, owner)
            info = (await apost(await alogged_in(owner), f"/api/rooms/{room.pk}/start/")).json()
            assert (info["running"], info["next_hand_at"]) == (True, None)  # one player only
            await drain(watcher)
            client = await alogged_in(b)
            await apost(client, f"/api/rooms/{room.pk}/seats/", {"seat": 2})  # brings chips
            messages = await drain(watcher, wait=0.6)
            countdowns = [
                m for m in by_type(messages, "room.updated") if m["payload"]["room"]["next_hand_at"]
            ]
            assert countdowns
            assert by_type(messages, "hand.started")

        run_async(body)

    def test_nobody_dealt_when_a_player_left_during_the_countdown(self, monkeypatch):
        countdown(monkeypatch, 0.3)
        room, owner, a, b = paused_room()

        async def body():
            watcher = await connect(room, owner)
            await apost(await alogged_in(owner), f"/api/rooms/{room.pk}/start/")
            bob = await alogged_in(b)
            assert (await bob.delete(f"/api/rooms/{room.pk}/seats/me/")).status_code == 204
            messages = await drain(watcher, wait=0.6)
            assert not by_type(messages, "hand.started")
            last = by_type(messages, "room.updated")[-1]["payload"]["room"]
            assert (last["running"], last["next_hand_at"]) == (True, None)
            # Back with chips: a new countdown, then the hand.
            await apost(bob, f"/api/rooms/{room.pk}/seats/", {"seat": 2})
            assert by_type(await drain(watcher, wait=0.6), "hand.started")

        run_async(body)

    def test_the_pause_after_a_hand_is_the_rooms_hand_pause_seconds(self, monkeypatch):
        monkeypatch.setattr(actor_module.TableActor, "next_hand_delay", None)
        room, owner, a, b = paused_room(hand_pause_seconds=7)
        room.running = True
        room.save()

        async def body():
            ca, cb = await connect(room, a), await connect(room, b)
            started, _ = await started_hand(ca, cb)
            first = started["payload"]["hand"]["actor"]
            conn = ca if first == str(a.pk) else cb
            await send_act(conn, room, started["hand_id"], "fold-first-hand", "fold")
            messages = await drain(conn)
            completed = by_type(messages, "hand.completed")[-1]
            after = by_type(messages, "room.updated")[-1]
            pause = when(after["payload"]["room"]["next_hand_at"]) - when(completed["server_time"])
            assert 6.5 < pause.total_seconds() < 7.5
            assert after["version"] == completed["version"] + 1

        run_async(body)

    def test_pause_during_a_hand_plays_it_out_then_deals_no_more(self, monkeypatch):
        monkeypatch.setattr(actor_module.TableActor, "next_hand_delay", 0)
        room, owner, a, b = paused_room()
        room.running = True
        room.save()

        async def body():
            ca, cb = await connect(room, a), await connect(room, b)
            started, _ = await started_hand(ca, cb)
            await apost(await alogged_in(owner), f"/api/rooms/{room.pk}/pause/")
            first = started["payload"]["hand"]["actor"]
            conn = ca if first == str(a.pk) else cb
            await send_act(conn, room, started["hand_id"], "fold-first-hand", "fold")
            messages = await drain(conn, wait=0.5)
            completed = [m["type"] for m in messages].index("hand.completed")
            assert not by_type(messages, "hand.started")  # no next hand, even with no pause
            assert countdowns(messages[completed:]) == []  # nor a pause announced for one
            assert (await actor_module.get_actor(room.pk))._room_info()["next_hand_at"] is None

        run_async(body)

    def test_sitting_back_in_counts_down_when_it_makes_two_players(self, monkeypatch):
        countdown(monkeypatch, 0.2)
        room, a, b = heads_up_room()
        RoomSeat.objects.filter(room=room, user=b).update(sitting_out=True)

        async def body():
            ca, cb = await connect(room, a), await connect(room, b)
            assert not by_type(await drain(ca, wait=0.4), "room.updated")  # one player only
            await cb.send_json_to(
                {
                    "protocol_version": 1,
                    "type": "command.sit_in",
                    "room_id": room.pk,
                    "command_id": "back-in-0001",
                    "payload": {},
                }
            )
            messages = await drain(ca, wait=0.5)
            assert countdowns(messages) and by_type(messages, "hand.started")
            await drain(cb)

        run_async(body)

    def test_chips_for_a_player_with_none_count_down_when_they_make_two(self, monkeypatch):
        countdown(monkeypatch, 0.2)
        room = make_room()
        owner, a, b = make_user("owner"), make_user("alice"), make_user("bob")
        room.owner = owner
        room.save()
        seat(room, a, 1)
        RoomSeat.objects.create(room=room, user=b, seat=2)  # seated, every chip lost

        async def body():
            ca = await connect(room, a)
            await connect(room, b)
            assert not by_type(await drain(ca, wait=0.4), "room.updated")  # one player only
            url = f"/api/rooms/{room.pk}/chips/"
            granted = await apost(
                await alogged_in(owner), url, {"player_id": str(b.pk), "amount": 50}
            )
            assert granted.status_code == 200
            messages = await drain(ca, wait=0.5)
            assert countdowns(messages) and by_type(messages, "hand.started")

        run_async(body)

    def test_a_hand_the_database_refuses_is_counted_down_again(self, monkeypatch):
        countdown(monkeypatch, 0.2)
        room, a, b = heads_up_room()
        real_create = Hand.objects.acreate
        refused = []

        async def create(**kwargs):
            if not refused:
                refused.append(kwargs["hand_no"])
                raise DatabaseError("the database went away")
            return await real_create(**kwargs)

        monkeypatch.setattr(Hand.objects, "acreate", create)

        async def body():
            ca = await connect(room, a)
            await connect(room, b)
            messages = await drain(ca, wait=0.6)
            # The first countdown, the deal the database refused, a fresh countdown, the hand.
            first, again = countdowns(messages)
            [started] = by_type(messages, "hand.started")
            assert messages.index(first) < messages.index(again) < messages.index(started)
            assert started["payload"]["hand"]["hand_no"] == 1  # the refused deal left nothing

        run_async(body)
        assert refused == [1]
        assert list(Hand.objects.filter(room=room).values_list("hand_no", flat=True)) == [1]

    def test_a_hand_number_already_taken_suspends_instead_of_retrying(self, monkeypatch):
        """The insert committed and then failed (or the number is taken): every retry would hit
        the same unique constraint, so the room stops for a restart instead of looping."""
        countdown(monkeypatch, 0.05)
        room, a, b = heads_up_room()
        attempts = []

        async def create(**kwargs):
            attempts.append(kwargs["hand_no"])
            raise IntegrityError("duplicate key value violates unique constraint")

        monkeypatch.setattr(Hand.objects, "acreate", create)

        async def body():
            ca = await connect(room, a)
            await connect(room, b)
            messages = await drain(ca, wait=0.6)
            assert by_type(messages, "room.suspended")
            assert not by_type(messages, "hand.started")

        run_async(body)
        assert attempts == [1]  # one try, no loop

    def test_the_e2e_pause_setting_shortens_the_pause_between_hands(self, monkeypatch, settings):
        monkeypatch.setattr(actor_module.TableActor, "next_hand_delay", None)  # no test override
        settings.TABLE_HAND_PAUSE_SECONDS = 0.1
        room, a, b = heads_up_room()  # hand_pause_seconds: 10

        async def body():
            ca, cb = await connect(room, a), await connect(room, b)
            started, _ = await started_hand(ca, cb)
            conn = ca if started["payload"]["hand"]["actor"] == str(a.pk) else cb
            await send_act(conn, room, started["hand_id"], "fold-first-hand", "fold")
            messages = await drain(conn, wait=0.5)
            completed = by_type(messages, "hand.completed")[-1]
            [pause] = countdowns(messages)
            seconds = when(pause["payload"]["room"]["next_hand_at"]) - when(
                completed["server_time"]
            )
            assert seconds.total_seconds() < 0.5  # 0.1 s, not the room's 10
            assert by_type(messages, "hand.started")  # the second hand, already

        run_async(body)

    def test_a_restart_keeps_the_room_running(self, monkeypatch):
        countdown(monkeypatch, 0.3)
        room, owner, a, b = paused_room()

        async def body():
            await apost(await alogged_in(owner), f"/api/rooms/{room.pk}/start/")
            await actor_module.reset_registry_for_tests()  # the server restarts
            table = await actor_module.get_actor(room.pk)
            assert table._room_info()["running"] is True
            ca, cb = await connect(room, a), await connect(room, b)
            assert by_type(await drain(ca, wait=0.6), "hand.started")
            await drain(cb)

        run_async(body)


class TestHandPauseSetting:
    def test_between_6_and_20_seconds(self):
        client = logged_in(make_user("an"))
        for wrong in (5, 21, "10", True):
            response = post(client, "/api/rooms/", {**ROOM, "hand_pause_seconds": wrong})
            assert response.status_code == 400, wrong
            assert "hand_pause_seconds" in response.json()["fields"]
        ok = post(client, "/api/rooms/", {**ROOM, "hand_pause_seconds": 6})
        assert ok.json()["room"]["hand_pause_seconds"] == 6

    def test_the_owner_changes_it(self):
        room, owner, a, b = paused_room()

        async def body():
            client = await alogged_in(owner)
            url = f"/api/rooms/{room.pk}/"
            assert (await apatch(client, url, {"hand_pause_seconds": 4})).status_code == 400
            changed = await apatch(client, url, {"hand_pause_seconds": 15})
            assert changed.json()["room"]["hand_pause_seconds"] == 15

        run_async(body)
        room.refresh_from_db()
        assert room.hand_pause_seconds == 15


def test_e2e_settings_shorten_the_countdown_and_the_pause(settings):
    """The E2E server's knobs (config/settings.py) stand in for the real times; a test's own
    override still wins."""
    from apps.games.actor import _seconds

    settings.TABLE_START_COUNTDOWN_SECONDS = None
    assert _seconds(None, "TABLE_START_COUNTDOWN_SECONDS", 10) == 10
    settings.TABLE_START_COUNTDOWN_SECONDS = 1.0
    assert _seconds(None, "TABLE_START_COUNTDOWN_SECONDS", 10) == 1.0
    assert _seconds(0, "TABLE_START_COUNTDOWN_SECONDS", 10) == 0
    with pytest.raises(AttributeError):  # a misspelled name fails instead of the real time
        _seconds(None, "TABLE_START_COUNTDOWN_SECOND", 10)


def test_e2e_seconds_from_the_environment_must_be_a_number_zero_or_more(monkeypatch):
    from django.core.exceptions import ImproperlyConfigured

    from config.settings import env_float

    name = "TABLE_HAND_PAUSE_SECONDS"
    monkeypatch.delenv(name, raising=False)
    assert env_float(name) is None
    for unset in ("", "  "):
        monkeypatch.setenv(name, unset)
        assert env_float(name) is None
    for value, seconds in (("0", 0.0), ("0.5", 0.5), (" 2 ", 2.0)):
        monkeypatch.setenv(name, value)
        assert env_float(name) == seconds
    for wrong in ("nan", "inf", "-inf", "1e999", "-1", "-0.5", "abc", "2s"):
        monkeypatch.setenv(name, wrong)
        with pytest.raises(ImproperlyConfigured, match=name):
            env_float(name)


def test_the_e2e_server_makes_rooms_that_deal_without_start(settings):
    settings.ROOMS_START_RUNNING = True
    detail = post(logged_in(make_user("an")), "/api/rooms/", ROOM).json()
    assert detail["room"]["running"] is True
