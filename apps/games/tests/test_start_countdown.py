"""Start, countdown, pause between hands, Pause (docs/api/ws-protocol.md "Bắt đầu, đếm ngược").

A new room is paused: nothing is dealt until the owner presses Start. Then the table counts
START_COUNTDOWN_SECONDS down before the first hand, and pauses hand_pause_seconds between hands.
Tests shorten the countdowns through TableActor.start_countdown / next_hand_delay.
"""

from datetime import datetime

import pytest

from apps.games import actor as actor_module
from apps.games.models import Room

from .test_actor import (  # noqa: F401
    _slow_next_hand,
    by_type,
    connect,
    drain,
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
            assert by_type(messages, "hand.completed")
            assert not by_type(messages, "hand.started")  # no next hand, even with no pause

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


def test_the_e2e_server_makes_rooms_that_deal_without_start(settings):
    settings.ROOMS_START_RUNNING = True
    detail = post(logged_in(make_user("an")), "/api/rooms/", ROOM).json()
    assert detail["room"]["running"] is True
