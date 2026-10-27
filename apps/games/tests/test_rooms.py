"""B7: rooms, lobby, invite links and the owner's powers (docs/api/openapi.yaml, tag rooms).

Owner actions go through the room's actor like every other change (ADR-001), so they are
ordered with the game: a change during a hand waits for the next hand.
"""

import json
from types import SimpleNamespace

import pytest
from channels.testing import WebsocketCommunicator
from django.core.cache import cache
from django.db.models import Sum
from django.test import AsyncClient, Client

from apps.accounts import ratelimit as accounts_ratelimit
from apps.games import actor as actor_module
from apps.games import rooms
from apps.games.consumers import RoomConsumer
from apps.games.models import LedgerEntry, Room, RoomBan, RoomMember, RoomSeat

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
    send_act,
    started_hand,
)

pytestmark = [pytest.mark.django_db(transaction=True)]
ROOM = {"name": "Bàn bạn bè", "small_blind": 5, "big_blind": 10}


@pytest.fixture(autouse=True)
def _fresh_rate_limits(monkeypatch):
    cache.clear()
    # One fixed window for the whole test (see apps/accounts/tests/conftest.py).
    monkeypatch.setattr(accounts_ratelimit, "time", SimpleNamespace(time=lambda: 1_800_000_030))


def post(client, path, body=None):
    return client.post(path, json.dumps(body or {}), content_type="application/json")


def logged_in(user) -> Client:
    client = Client()
    client.force_login(user)
    return client


async def alogged_in(user) -> AsyncClient:
    client = AsyncClient()
    await client.aforce_login(user)
    return client


async def apost(client, path, body=None):
    return await client.post(path, json.dumps(body or {}), content_type="application/json")


async def apatch(client, path, body):
    return await client.patch(path, json.dumps(body), content_type="application/json")


def owned_heads_up(**kwargs):
    room, a, b = heads_up_room(**kwargs)
    owner = make_user("owner")
    room.owner = owner
    room.save()
    return room, owner, a, b


def owned_one_player():
    """Owner + one funded player seated: connecting deals no hand, so we stay between hands."""
    room = make_room()
    owner, a = make_user("owner"), make_user("alice")
    room.owner = owner
    room.save()
    seat(room, a, 1)
    return room, owner, a


def balance(room, user) -> int:
    return LedgerEntry.objects.filter(room=room, user=user).aggregate(t=Sum("amount"))["t"] or 0


async def closed_with(conn, timeout=1.0) -> int | None:
    """Read until the server closes the socket; return its close code."""
    while True:
        output = await conn.receive_output(timeout=timeout)
        if output["type"] == "websocket.close":
            return output.get("code")


class TestCreateAndLobby:
    def test_creating_a_room_makes_the_caller_its_owner(self):
        user = make_user("an")
        response = post(logged_in(user), "/api/rooms/", {**ROOM, "is_private": True})

        assert response.status_code == 201
        detail = response.json()
        assert detail["is_owner"] is True
        assert detail["owner_id"] == str(user.pk)
        assert detail["is_private"] is True
        assert detail["invite_token"]
        assert detail["pending"] is None and detail["closing"] is False
        assert detail["room"]["status"] == "open"
        assert detail["room"]["big_blind"] == 10
        assert RoomMember.objects.filter(room_id=detail["room"]["room_id"], user=user).exists()

    def test_creating_needs_a_session(self):
        response = post(Client(), "/api/rooms/", ROOM)
        assert response.status_code == 401
        assert response.json()["code"] == "not_authenticated"

    def test_blinds_are_validated(self):
        response = post(logged_in(make_user("an")), "/api/rooms/", {**ROOM, "small_blind": 10})
        assert response.status_code == 400
        body = response.json()
        assert body["code"] == "validation_error"
        assert "small_blind" in body["fields"]

    def test_creating_is_rate_limited(self):
        client = logged_in(make_user("an"))
        for _ in range(rooms.ROOMS_PER_USER.limit):
            assert post(client, "/api/rooms/", ROOM).status_code == 201
        response = post(client, "/api/rooms/", ROOM)
        assert response.status_code == 429
        assert response.json()["code"] == "rate_limited"

    def test_lobby_shows_public_rooms_and_my_private_ones_only(self):
        me, other = make_user("an"), make_user("binh")
        mine = post(logged_in(me), "/api/rooms/", {**ROOM, "name": "Của tôi", "is_private": True})
        post(
            logged_in(other), "/api/rooms/", {**ROOM, "name": "Riêng của Bình", "is_private": True}
        )
        post(logged_in(other), "/api/rooms/", {**ROOM, "name": "Công khai"})
        closed = make_room(name="Đã đóng", status=Room.Status.CLOSED)
        assert closed.pk

        names = {r["room"]["name"] for r in Client().get("/api/rooms/").json()["rooms"]}
        assert names == {"Công khai"}
        lobby = logged_in(me).get("/api/rooms/").json()["rooms"]
        assert {r["room"]["name"] for r in lobby} == {"Công khai", "Của tôi"}
        row = next(r for r in lobby if r["room"]["name"] == "Của tôi")
        assert row == {
            "room": mine.json()["room"],
            "is_private": True,
            "owner_name": "an",
            "seated": 0,
        }


class TestPrivateRooms:
    def private_room(self):
        owner = make_user("owner")
        detail = post(logged_in(owner), "/api/rooms/", {**ROOM, "is_private": True}).json()
        return owner, detail["room"]["room_id"], detail["invite_token"]

    def test_an_outsider_can_neither_see_nor_sit(self):
        _, room_id, _ = self.private_room()
        outsider = logged_in(make_user("x"))
        assert outsider.get(f"/api/rooms/{room_id}/").json()["code"] == "room_not_found"

        async def body():
            client = await alogged_in(await make_user_async("y"))
            snapshot = await client.get(f"/api/rooms/{room_id}/snapshot/")
            assert snapshot.status_code == 404
            seat = await apost(client, f"/api/rooms/{room_id}/seats/", {"seat": 1})
            assert seat.status_code == 404 and seat.json()["code"] == "room_not_found"

        run_async(body)

    def test_the_invite_link_lets_a_visitor_in(self):
        _, room_id, token = self.private_room()

        async def body():
            visitor = AsyncClient()  # not even logged in: becomes a guest, like at a table
            joined = await apost(visitor, "/api/rooms/join/", {"invite_token": token})
            assert joined.status_code == 200
            assert joined.json()["room"]["room_id"] == room_id
            assert joined.json()["invite_token"] is None  # only the owner sees it
            assert (await visitor.get(f"/api/rooms/{room_id}/snapshot/")).status_code == 200
            seat = await apost(visitor, f"/api/rooms/{room_id}/seats/", {"seat": 2})
            assert seat.status_code == 201

        run_async(body)

    def test_rotating_the_invite_kills_old_links_but_keeps_members(self):
        owner, room_id, old = self.private_room()
        member = make_user("m")
        post(logged_in(member), "/api/rooms/join/", {"invite_token": old})

        rotated = post(logged_in(owner), f"/api/rooms/{room_id}/invite/")
        assert rotated.status_code == 200
        assert rotated.json()["invite_token"] not in (None, old)
        late = post(logged_in(make_user("late")), "/api/rooms/join/", {"invite_token": old})
        assert late.status_code == 404
        assert logged_in(member).get(f"/api/rooms/{room_id}/").status_code == 200

    def test_only_the_owner_rotates_the_invite(self):
        _, room_id, _ = self.private_room()
        response = post(logged_in(make_user("x")), f"/api/rooms/{room_id}/invite/")
        assert response.status_code == 404  # cannot even see the private room

    def test_websocket_without_access_is_refused(self):
        _, room_id, _ = self.private_room()
        outsider = make_user("x")

        async def body():
            conn = WebsocketCommunicator(RoomConsumer.as_asgi(), f"/ws/rooms/{room_id}/")
            conn.scope["url_route"] = {"kwargs": {"room_id": str(room_id)}}
            conn.scope["user"] = outsider
            conn.scope["session"] = None
            connected, code = await conn.connect()
            assert connected is False
            assert code == 4404

        run_async(body)


async def make_user_async(name):
    from asgiref.sync import sync_to_async

    return await sync_to_async(make_user)(name)


class TestChips:
    def test_someone_who_is_not_the_owner_cannot_grant_chips(self):
        room, owner, a, b = owned_heads_up()
        before = balance(room, a)

        async def body():
            client = await alogged_in(b)
            response = await apost(
                client, f"/api/rooms/{room.pk}/chips/", {"player_id": str(a.pk), "amount": 500}
            )
            assert response.status_code == 403
            assert response.json()["code"] == "forbidden"

        run_async(body)
        assert balance(room, a) == before

    def test_the_owner_grants_chips_and_the_table_sees_the_new_stack(self):
        room, owner, a = owned_one_player()

        async def body():
            watcher = await connect(room, owner)
            client = await alogged_in(owner)
            response = await apost(
                client, f"/api/rooms/{room.pk}/chips/", {"player_id": str(a.pk), "amount": 300}
            )
            assert response.status_code == 200
            assert response.json() == {
                "player_id": str(a.pk),
                "amount": 300,
                "balance": CHIPS + 300,
            }
            updates = by_type(await drain(watcher), "seat.updated")
            assert updates[-1]["payload"]["occupant"]["stack"] == CHIPS + 300

        run_async(body)
        assert balance(room, a) == CHIPS + 300
        kinds = list(LedgerEntry.objects.filter(room=room, user=a).values_list("kind", flat=True))
        assert kinds == ["grant", "grant"]

    def test_grants_are_checked(self):
        room, owner, a, b = owned_heads_up()
        stranger = make_user("s")

        async def body():
            client = await alogged_in(owner)
            url = f"/api/rooms/{room.pk}/chips/"
            negative = await apost(client, url, {"player_id": str(a.pk), "amount": -CHIPS - 1})
            assert negative.status_code == 409 and negative.json()["code"] == "negative_balance"
            zero = await apost(client, url, {"player_id": str(a.pk), "amount": 0})
            assert zero.status_code == 400 and zero.json()["code"] == "validation_error"
            unseated = await apost(client, url, {"player_id": str(stranger.pk), "amount": 5})
            assert unseated.status_code == 409 and unseated.json()["code"] == "not_seated"
            taken_back = await apost(client, url, {"player_id": str(a.pk), "amount": -CHIPS})
            assert taken_back.json()["balance"] == 0

        run_async(body)

    def test_no_grant_to_a_player_in_the_running_hand(self):
        room, owner, a, b = owned_heads_up()

        async def body():
            ca, cb = await connect(room, a), await connect(room, b)
            await started_hand(ca, cb)
            client = await alogged_in(owner)
            response = await apost(
                client, f"/api/rooms/{room.pk}/chips/", {"player_id": str(a.pk), "amount": 50}
            )
            assert response.status_code == 409
            assert response.json()["code"] == "player_in_hand"

        run_async(body)


class TestSettings:
    def test_a_change_between_hands_applies_now_and_is_broadcast(self):
        room, owner, a = owned_one_player()

        async def body():
            watcher = await connect(room, owner)
            client = await alogged_in(owner)
            response = await apatch(
                client, f"/api/rooms/{room.pk}/", {"small_blind": 2, "big_blind": 4}
            )
            assert response.status_code == 200
            detail = response.json()
            assert detail["pending"] is None
            assert (detail["room"]["small_blind"], detail["room"]["big_blind"]) == (2, 4)
            updated = by_type(await drain(watcher), "room.updated")
            assert updated[-1]["payload"]["room"]["big_blind"] == 4

        run_async(body)
        room.refresh_from_db()
        assert (room.small_blind, room.big_blind) == (2, 4)

    def test_a_change_during_a_hand_waits_for_the_next_hand(self, monkeypatch):
        room, owner, a, b = owned_heads_up()

        async def body():
            ca, cb = await connect(room, a), await connect(room, b)
            started, _ = await started_hand(ca, cb)
            client = await alogged_in(owner)
            response = await apatch(client, f"/api/rooms/{room.pk}/", {"big_blind": 6})
            assert response.status_code == 200
            assert response.json()["pending"] == {"big_blind": 6}
            assert response.json()["room"]["big_blind"] == 2
            assert not by_type(await drain(ca), "room.updated")

            monkeypatch.setattr(actor_module.TableActor, "next_hand_delay", 0)
            first = a if started["payload"]["hand"]["actor"] == str(a.pk) else b
            await send_act(
                ca if first is a else cb, room, started["hand_id"], "fold-first-hand", "fold"
            )
            messages = await drain(ca, wait=0.5)
            types = [m["type"] for m in messages]
            assert types.index("room.updated") < len(types) - 1 - types[::-1].index("hand.started")
            assert by_type(messages, "room.updated")[-1]["payload"]["room"]["big_blind"] == 6
            assert by_type(messages, "hand.started")[-1]["payload"]["hand"]["hand_no"] == 2

        run_async(body)
        room.refresh_from_db()
        assert room.big_blind == 6

    def test_small_blind_must_stay_below_big_blind(self):
        room, owner, a, b = owned_heads_up()

        async def body():
            client = await alogged_in(owner)
            response = await apatch(client, f"/api/rooms/{room.pk}/", {"small_blind": 2})
            assert response.status_code == 400
            assert response.json()["code"] == "validation_error"

        run_async(body)

    def test_only_the_owner_changes_settings(self):
        room, owner, a, b = owned_heads_up()

        async def body():
            client = await alogged_in(a)
            response = await apatch(client, f"/api/rooms/{room.pk}/", {"big_blind": 4})
            assert response.status_code == 403

        run_async(body)


class TestKick:
    def test_kicked_player_loses_the_seat_the_connection_and_the_way_back(self):
        room, owner, a = owned_one_player()
        room.is_private, room.invite_token = True, "invite-token-for-test"
        room.save()
        RoomMember.objects.create(room=room, user=a)

        async def body():
            kicked_conn = await connect(room, a)
            client = await alogged_in(owner)
            response = await apost(client, f"/api/rooms/{room.pk}/kick/", {"player_id": str(a.pk)})
            assert response.status_code == 204
            assert await closed_with(kicked_conn) == 4403

            again = await alogged_in(a)
            seat = await apost(again, f"/api/rooms/{room.pk}/seats/", {"seat": 3})
            assert seat.status_code == 403 and seat.json()["code"] == "kicked"
            join = await apost(again, "/api/rooms/join/", {"invite_token": "invite-token-for-test"})
            assert join.status_code == 403 and join.json()["code"] == "kicked"

        run_async(body)
        assert not RoomSeat.objects.filter(room=room, user=a).exists()
        assert not RoomMember.objects.filter(room=room, user=a).exists()
        assert RoomBan.objects.filter(room=room, user=a).exists()
        assert balance(room, a) == CHIPS  # chips stay in the room's ledger

    def test_no_kick_during_the_players_hand(self):
        room, owner, a, b = owned_heads_up()

        async def body():
            ca, cb = await connect(room, a), await connect(room, b)
            await started_hand(ca, cb)
            client = await alogged_in(owner)
            response = await apost(client, f"/api/rooms/{room.pk}/kick/", {"player_id": str(a.pk)})
            assert response.status_code == 409
            assert response.json()["code"] == "player_in_hand"

        run_async(body)

    def test_the_owner_cannot_kick_themselves(self):
        room, owner, a, b = owned_heads_up()

        async def body():
            client = await alogged_in(owner)
            url = f"/api/rooms/{room.pk}/kick/"
            response = await apost(client, url, {"player_id": str(owner.pk)})
            assert response.status_code == 400

        run_async(body)


class TestClose:
    def test_closing_between_hands_is_immediate(self):
        room, owner, a = owned_one_player()
        stranger = make_user("s")

        async def body():
            watcher = await connect(room, owner)
            client = await alogged_in(owner)
            response = await apost(client, f"/api/rooms/{room.pk}/close/")
            assert response.status_code == 200
            assert response.json()["room"]["status"] == "closed"
            updated = by_type(await drain(watcher), "room.updated")
            assert updated[-1]["payload"]["room"]["status"] == "closed"
            late = await alogged_in(stranger)
            seat = await apost(late, f"/api/rooms/{room.pk}/seats/", {"seat": 5})
            assert seat.status_code == 409 and seat.json()["code"] == "room_closed"

        run_async(body)
        room.refresh_from_db()
        assert room.status == Room.Status.CLOSED
        assert Client().get("/api/rooms/").json()["rooms"] == []

    def test_closing_during_a_hand_waits_for_it_to_finish(self, monkeypatch):
        room, owner, a, b = owned_heads_up()
        monkeypatch.setattr(actor_module.TableActor, "next_hand_delay", 0)

        async def body():
            ca, cb = await connect(room, a), await connect(room, b)
            started, _ = await started_hand(ca, cb)
            client = await alogged_in(owner)
            response = await apost(client, f"/api/rooms/{room.pk}/close/")
            assert response.status_code == 202
            assert response.json()["closing"] is True
            assert response.json()["room"]["status"] == "playing"

            first = a if started["payload"]["hand"]["actor"] == str(a.pk) else b
            conn = ca if first is a else cb
            await send_act(conn, room, started["hand_id"], "fold-last-hand", "fold")
            messages = await drain(ca, wait=0.5)
            assert by_type(messages, "hand.completed")
            assert not by_type(messages, "hand.started")
            assert by_type(messages, "room.updated")[-1]["payload"]["room"]["status"] == "closed"

        run_async(body)
        room.refresh_from_db()
        assert room.status == Room.Status.CLOSED


class TestCommandRateLimit:
    def test_too_many_commands_from_one_player_are_rejected(self):
        room, owner, a, b = owned_heads_up()

        async def body():
            conn = await connect(room, a)
            for i in range(rooms.COMMANDS_PER_PLAYER.limit + 1):
                await conn.send_json_to(
                    {
                        "protocol_version": 1,
                        "type": "command.sit_out" if i % 2 == 0 else "command.sit_in",
                        "room_id": room.pk,
                        "command_id": f"spam-command-{i:04d}",
                        "payload": {},
                    }
                )
            codes = [m["payload"]["code"] for m in by_type(await drain(conn), "command.rejected")]
            assert "rate_limited" in codes

        run_async(body)


class TestCsrf:
    def test_a_post_without_the_token_gets_a_json_error(self):
        client = Client(enforce_csrf_checks=True)
        client.force_login(make_user("an"))
        response = post(client, "/api/rooms/", ROOM)
        assert response.status_code == 403
        assert response.json()["code"] == "forbidden"


class TestContract:
    """Responses match docs/api/openapi.yaml, which the web app's types are generated from."""

    @staticmethod
    def validate(instance, name):
        from pathlib import Path

        import jsonschema
        import yaml
        from django.conf import settings
        from referencing import Registry, Resource

        api = Path(settings.BASE_DIR) / "docs" / "api"
        openapi = yaml.safe_load((api / "openapi.yaml").read_text())
        registry = Registry()
        for path in (api / "schema").rglob("*.schema.json"):
            resource = Resource.from_contents(json.loads(path.read_text()))
            registry = registry.with_resource(path.as_uri(), resource)
        schema = {
            "$id": (api / "openapi.yaml").as_uri(),
            "$ref": f"#/components/schemas/{name}",
            "components": openapi["components"],
        }
        jsonschema.Draft202012Validator(schema, registry=registry).validate(instance)

    def test_detail_lobby_and_errors_match(self):
        import yaml
        from django.conf import settings

        user = make_user("an")
        client = logged_in(user)
        detail = post(client, "/api/rooms/", {**ROOM, "is_private": True}).json()
        self.validate(detail, "RoomDetail")
        self.validate(client.get("/api/rooms/").json(), "Lobby")
        self.validate(post(client, "/api/rooms/", {"name": ""}).json(), "ApiError")

        openapi = yaml.safe_load((settings.BASE_DIR / "docs/api/openapi.yaml").read_text())
        codes = set(openapi["components"]["schemas"]["ApiError"]["properties"]["code"]["enum"])
        assert set(rooms.STATUS) <= codes

    def test_grant_result_matches(self):
        room, owner, a = owned_one_player()

        async def body():
            client = await alogged_in(owner)
            url = f"/api/rooms/{room.pk}/chips/"
            response = await apost(client, url, {"player_id": str(a.pk), "amount": 5})
            self.validate(response.json(), "GrantChipsResult")

        run_async(body)
