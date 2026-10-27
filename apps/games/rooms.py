"""B7 REST: lobby, rooms, invite links and the owner's powers (docs/api/openapi.yaml, rooms).

Who may see a room: anyone for a public room; for a private one the owner, members (joined
through the invite link) and whoever is seated. Someone the owner kicked gets ``kicked``.
Owner actions go through the room's actor (ADR-001), so they are ordered with the game.
"""

import json
import secrets
from typing import Any

from asgiref.sync import sync_to_async
from django.db.models import Count, Q
from django.http import HttpRequest, JsonResponse

from apps.accounts.ratelimit import RateLimit, RateLimited

from . import actor as actor_module
from .accounts import player_for_request
from .models import Room, RoomBan, RoomMember, RoomSeat, User

ROOMS_PER_USER = RateLimit("rooms-user", limit=10, window=60 * 60)
# Commands over WebSocket, per player (consumers.py): far above what a person clicks.
COMMANDS_PER_PLAYER = RateLimit("ws-commands", limit=20, window=10)

STATUS = {
    "validation_error": 400,
    "invalid_seat": 400,
    "not_authenticated": 401,
    "forbidden": 403,
    "kicked": 403,
    "room_not_found": 404,
    "method_not_allowed": 405,
    "seat_taken": 409,
    "already_seated": 409,
    "not_seated": 409,
    "player_in_hand": 409,
    "room_closed": 409,
    "negative_balance": 409,
    "rate_limited": 429,
}


def error(code: str, message: str = "", fields: dict | None = None) -> JsonResponse:
    body: dict[str, Any] = {"code": code, "message": message or code}
    if fields:
        body["fields"] = fields
    return JsonResponse(body, status=STATUS[code])


def rate_limited(exc: RateLimited) -> JsonResponse:
    response = error("rate_limited", "Too many requests.")
    response["Retry-After"] = str(exc.retry_after)
    return response


class BadRequest(Exception):
    def __init__(self, fields: dict[str, list[str]]):
        super().__init__("validation_error")
        self.fields = fields


def read_json(request: HttpRequest) -> dict[str, Any]:
    try:
        body = json.loads(request.body or b"{}")
    except ValueError as exc:
        raise BadRequest({"non_field_errors": ["Body must be JSON."]}) from exc
    if not isinstance(body, dict):
        raise BadRequest({"non_field_errors": ["Body must be a JSON object."]})
    return body


# Allowed fields: name -> (type, min, max). Mirrors CreateRoomRequest / UpdateRoomRequest.
SETTING_RULES = {
    "name": (str, 1, 100),
    "max_seats": (int, 2, 9),
    "small_blind": (int, 1, None),
    "big_blind": (int, 2, None),
    "think_time_seconds": (int, 5, 120),
    "seven_deuce_bonus": (int, 0, None),
    "is_private": (bool, None, None),
}


def clean_settings(body: dict[str, Any], allowed: tuple[str, ...]) -> dict[str, Any]:
    fields: dict[str, list[str]] = {}
    clean: dict[str, Any] = {}
    for key, value in body.items():
        if key not in allowed:
            fields[key] = ["Unknown field."]
            continue
        kind, low, high = SETTING_RULES[key]
        # bool is an int in Python; never accept true/false for a number.
        if not isinstance(value, kind) or (kind is int and isinstance(value, bool)):
            fields[key] = [f"Must be {kind.__name__}."]
            continue
        size = len(value) if kind is str else value
        if kind is not bool and ((low is not None and size < low) or (high and size > high)):
            fields[key] = [f"Must be between {low} and {high or '∞'}."]
            continue
        clean[key] = value.strip() if kind is str else value
    if fields:
        raise BadRequest(fields)
    return clean


# ---- who may see a room --------------------------------------------------------------------


async def access(room: Room, user) -> str:
    """``"ok"``, ``"kicked"`` or ``"hidden"`` (a private room this user may not see)."""
    if not user.is_authenticated:
        return "hidden" if room.is_private else "ok"
    if await RoomBan.objects.filter(room=room, user=user).aexists():
        return "kicked"
    if not room.is_private or room.owner_id == user.pk:
        return "ok"
    member = RoomMember.objects.filter(room=room, user=user)
    seated = RoomSeat.objects.filter(room=room, user=user)
    return "ok" if await member.aexists() or await seated.aexists() else "hidden"


async def visible_room(room_id: int, user) -> Room | JsonResponse:
    room = await Room.objects.select_related("owner").filter(pk=room_id).afirst()
    verdict = await access(room, user) if room is not None else "hidden"
    if verdict == "hidden":
        return error("room_not_found", "No such room.")
    if verdict == "kicked":
        return error("kicked", "The owner removed you from this room.")
    return room


def room_info(room: Room) -> dict[str, Any]:
    live = actor_module._actors.get(room.pk)
    if live is not None:
        return live._room_info()
    return {
        "room_id": room.pk,
        "name": room.name,
        "status": "closed" if room.status == Room.Status.CLOSED else "open",
        "max_seats": room.max_seats,
        "small_blind": room.small_blind,
        "big_blind": room.big_blind,
        "think_time_seconds": room.think_time_seconds,
        "seven_deuce_bonus": room.seven_deuce_bonus,
    }


def room_detail(room: Room, user) -> dict[str, Any]:
    live = actor_module._actors.get(room.pk)
    is_owner = bool(user.is_authenticated and room.owner_id == user.pk)
    return {
        "room": room_info(room),
        "is_private": room.is_private,
        "owner_id": str(room.owner_id) if room.owner_id else None,
        "owner_name": room.owner.username if room.owner_id else None,
        "is_owner": is_owner,
        "invite_token": room.invite_token if is_owner else None,
        "pending": dict(live.pending) if live is not None and live.pending else None,
        "closing": live.closing if live is not None else False,
    }


def new_invite_token() -> str:
    return secrets.token_urlsafe(24)


# ---- views ---------------------------------------------------------------------------------


async def rooms_collection(request: HttpRequest) -> JsonResponse:
    if request.method == "GET":
        return await _lobby(request)
    if request.method == "POST":
        return await _create(request)
    return error("method_not_allowed", "GET or POST.")


async def _lobby(request: HttpRequest) -> JsonResponse:
    user = await request.auser()
    visible = Q(is_private=False)
    if user.is_authenticated:
        visible |= Q(owner=user) | Q(members__user=user)
        visible &= ~Q(bans__user=user)
    rooms = (
        Room.objects.exclude(status=Room.Status.CLOSED)
        .filter(visible)
        .distinct()
        .select_related("owner")
        .annotate(seated=Count("seats", distinct=True))
        .order_by("-created_at")
    )
    rows = [
        {
            "room": room_info(room),
            "is_private": room.is_private,
            "owner_name": room.owner.username if room.owner_id else None,
            "seated": room.seated,
        }
        async for room in rooms
    ]
    return JsonResponse({"rooms": rows})


async def _create(request: HttpRequest) -> JsonResponse:
    user = await request.auser()
    if not user.is_authenticated:
        return error("not_authenticated", "Log in (a guest is fine) to create a room.")
    try:
        settings = clean_settings(read_json(request), tuple(SETTING_RULES))
        missing = [key for key in ("name", "small_blind", "big_blind") if key not in settings]
        if missing:
            raise BadRequest({key: ["Required."] for key in missing})
        if settings["small_blind"] >= settings["big_blind"]:
            raise BadRequest({"small_blind": ["Must be below big_blind."]})
        ROOMS_PER_USER.hit(str(user.pk))
    except BadRequest as exc:
        return error("validation_error", "Invalid body.", exc.fields)
    except RateLimited as exc:
        return rate_limited(exc)
    room = await Room.objects.acreate(owner=user, invite_token=new_invite_token(), **settings)
    await RoomMember.objects.acreate(room=room, user=user)
    room = await Room.objects.select_related("owner").aget(pk=room.pk)
    return JsonResponse(room_detail(room, user), status=201)


async def room_item(request: HttpRequest, room_id: int) -> JsonResponse:
    if request.method == "GET":
        user = await request.auser()
        room = await visible_room(room_id, user)
        if isinstance(room, JsonResponse):
            return room
        return JsonResponse(room_detail(room, user))
    if request.method == "PATCH":
        return await _update(request, room_id)
    return error("method_not_allowed", "GET or PATCH.")


async def _owned_room(request: HttpRequest, room_id: int) -> tuple[Room, Any] | JsonResponse:
    if request.method != "POST" and request.method != "PATCH":
        return error("method_not_allowed", "POST.")
    user = await request.auser()
    if not user.is_authenticated:
        return error("not_authenticated", "Log in first.")
    room = await visible_room(room_id, user)
    if isinstance(room, JsonResponse):
        return room
    if room.owner_id != user.pk:
        return error("forbidden", "Only the room's owner can do this.")
    return room, user


def _reject_response(reject: actor_module.Reject) -> JsonResponse:
    if reject.code == "validation_error":
        return error("validation_error", str(reject), {"small_blind": [str(reject)]})
    return error(reject.code, str(reject))


async def _update(request: HttpRequest, room_id: int) -> JsonResponse:
    owned = await _owned_room(request, room_id)
    if isinstance(owned, JsonResponse):
        return owned
    room, user = owned
    try:
        changes = clean_settings(read_json(request), actor_module.ROOM_SETTINGS)
        if not changes:
            raise BadRequest({"non_field_errors": ["Change at least one setting."]})
    except BadRequest as exc:
        return error("validation_error", "Invalid body.", exc.fields)
    live = await actor_module.get_actor(room.pk)
    try:
        await live.update_settings(changes)
    except actor_module.Reject as reject:
        return _reject_response(reject)
    return JsonResponse(room_detail(room, user))


async def grant_chips(request: HttpRequest, room_id: int) -> JsonResponse:
    owned = await _owned_room(request, room_id)
    if isinstance(owned, JsonResponse):
        return owned
    room, _ = owned
    try:
        body = read_json(request)
        player_id, amount = body.get("player_id"), body.get("amount")
        fields = {}
        if not isinstance(player_id, str) or not player_id.isdigit():
            fields["player_id"] = ["A player_id string."]
        if not isinstance(amount, int) or isinstance(amount, bool) or amount == 0:
            fields["amount"] = ["A non-zero integer."]
        if fields or set(body) - {"player_id", "amount"}:
            raise BadRequest(fields or {"non_field_errors": ["Unknown field."]})
    except BadRequest as exc:
        return error("validation_error", "Invalid body.", exc.fields)
    live = await actor_module.get_actor(room.pk)
    try:
        balance = await live.grant_chips(player_id, amount)
    except actor_module.Reject as reject:
        return _reject_response(reject)
    return JsonResponse({"player_id": player_id, "amount": amount, "balance": balance})


async def kick(request: HttpRequest, room_id: int) -> JsonResponse:
    owned = await _owned_room(request, room_id)
    if isinstance(owned, JsonResponse):
        return owned
    room, user = owned
    try:
        body = read_json(request)
        player_id = body.get("player_id")
        if not isinstance(player_id, str) or not player_id.isdigit() or set(body) != {"player_id"}:
            raise BadRequest({"player_id": ["A player_id string."]})
        if int(player_id) == user.pk:
            raise BadRequest({"player_id": ["The owner cannot kick themselves."]})
    except BadRequest as exc:
        return error("validation_error", "Invalid body.", exc.fields)
    if not await User.objects.filter(pk=int(player_id)).aexists():
        return error("validation_error", "No such player.", {"player_id": ["No such player."]})
    live = await actor_module.get_actor(room.pk)
    try:
        await live.kick(int(player_id))
    except actor_module.Reject as reject:
        return _reject_response(reject)
    return JsonResponse(None, status=204, safe=False)


async def close(request: HttpRequest, room_id: int) -> JsonResponse:
    owned = await _owned_room(request, room_id)
    if isinstance(owned, JsonResponse):
        return owned
    room, user = owned
    live = await actor_module.get_actor(room.pk)
    closed_now = await live.close()
    return JsonResponse(room_detail(room, user), status=200 if closed_now else 202)


async def rotate_invite(request: HttpRequest, room_id: int) -> JsonResponse:
    owned = await _owned_room(request, room_id)
    if isinstance(owned, JsonResponse):
        return owned
    room, user = owned
    room.invite_token = new_invite_token()
    await room.asave(update_fields=["invite_token"])
    return JsonResponse(room_detail(room, user))


async def join(request: HttpRequest) -> JsonResponse:
    if request.method != "POST":
        return error("method_not_allowed", "POST.")
    try:
        token = read_json(request).get("invite_token")
        if not isinstance(token, str) or not 1 <= len(token) <= 64:
            raise BadRequest({"invite_token": ["Required."]})
    except BadRequest as exc:
        return error("validation_error", "Invalid body.", exc.fields)
    room = await Room.objects.select_related("owner").filter(invite_token=token).afirst()
    if room is None:
        return error("room_not_found", "Bad or old invite link.")
    user = await player_for_request(request)
    if await RoomBan.objects.filter(room=room, user=user).aexists():
        return error("kicked", "The owner removed you from this room.")
    if room.status == Room.Status.CLOSED:
        return error("room_closed", "This room is closed.")
    await sync_to_async(RoomMember.objects.get_or_create)(room=room, user=user)
    return JsonResponse(room_detail(room, user))
