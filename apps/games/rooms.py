"""B7 REST: lobby, rooms, invite links and the owner's powers (docs/api/openapi.yaml, rooms).

Who may see a room: anyone for a public room; for a private one the owner, members (joined
through the invite link) and whoever is seated. Someone the owner kicked gets ``kicked``.
Owner actions go through the room's actor (ADR-001), so they are ordered with the game.
"""

import json
import re
import secrets
from typing import Any

from asgiref.sync import sync_to_async
from django.conf import settings as django_settings
from django.db.models import Count, Exists, OuterRef, Q
from django.http import HttpRequest, JsonResponse

from apps.accounts.ratelimit import RateLimit, RateLimited
from apps.accounts.views import client_ip

from . import actor as actor_module
from .accounts import player_for_request
from .models import (
    MAX_HAND_PAUSE,
    MAX_STARTING_STACK,
    MIN_HAND_PAUSE,
    Hand,
    OwnerAction,
    Room,
    RoomBan,
    RoomMember,
    RoomSeat,
    User,
)

ROOMS_PER_USER = RateLimit("rooms-user", limit=10, window=60 * 60)
# Commands over WebSocket, per player (consumers.py): far above what a person clicks.
COMMANDS_PER_PLAYER = RateLimit("ws-commands", limit=20, window=10)
CHAT_PER_PLAYER = RateLimit("ws-chat", limit=5, window=10)
# REST: sitting down and standing up (together) per player, and invite links tried per address.
# Far above what a person does; low enough that a script cannot churn a table's seats or try
# invite tokens in bulk.
SEAT_CHANGES_PER_PLAYER = RateLimit("seat-changes", limit=10, window=60)
JOINS_PER_IP = RateLimit("join-ip", limit=20, window=10 * 60)

STATUS = {
    "validation_error": 400,
    "invalid_seat": 400,
    "not_authenticated": 401,
    "forbidden": 403,
    "kicked": 403,
    "room_not_found": 404,
    "hand_not_found": 404,
    "method_not_allowed": 405,
    "seat_taken": 409,
    "already_seated": 409,
    "not_seated": 409,
    "player_in_hand": 409,
    "has_chips": 409,
    "room_closed": 409,
    "negative_balance": 409,
    "room_suspended": 409,
    "hand_voided": 409,
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
    "starting_stack": (int, 1, MAX_STARTING_STACK),
    "ante": (int, 0, MAX_STARTING_STACK),
    "bomb_pot_every": (int, 0, 1000),
    "bomb_pot_amount": (int, 0, MAX_STARTING_STACK),
    "run_it_twice": (bool, None, None),
    "rabbit_hunt": (bool, None, None),
    "hand_pause_seconds": (int, MIN_HAND_PAUSE, MAX_HAND_PAUSE),
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
        if kind is str:
            value = value.strip()  # check the length of what will be stored
        size = len(value) if kind is str else value
        if kind is not bool and ((low is not None and size < low) or (high and size > high)):
            fields[key] = [f"Must be between {low} and {high or '∞'}."]
            continue
        clean[key] = value
    if fields:
        raise BadRequest(fields)
    return clean


# ---- who may see a room --------------------------------------------------------------------


async def access(room: Room, user) -> str:
    """``"ok"``, ``"kicked"`` or ``"hidden"`` (a private room this user may not see)."""
    if not user.is_authenticated:
        return "hidden" if room.is_private else "ok"
    if user.is_staff:
        return "ok"  # staff may act as the owner of any room (B8)
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
    if room.status == Room.Status.CLOSED:
        status = "closed"
    else:
        # No actor yet (nobody opened the room since the server started): an unfinished hand
        # in the database will be resumed (or suspend the room) when someone does.
        status = "playing" if getattr(room, "unfinished_hand", False) else "open"
    return {
        "room_id": room.pk,
        "name": room.name,
        "status": status,
        "max_seats": room.max_seats,
        "small_blind": room.small_blind,
        "big_blind": room.big_blind,
        "think_time_seconds": room.think_time_seconds,
        "seven_deuce_bonus": room.seven_deuce_bonus,
        "starting_stack": room.starting_stack,
        "ante": room.ante,
        "bomb_pot_every": room.bomb_pot_every,
        "bomb_pot_amount": room.bomb_pot_amount,
        "run_it_twice": room.run_it_twice,
        "rabbit_hunt": room.rabbit_hunt,
        "hand_pause_seconds": room.hand_pause_seconds,
        "running": room.running,
        "next_hand_at": None,  # no actor, so nothing scheduled
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


PLAYER_ID = re.compile(r"[1-9][0-9]*")  # common.schema.json#/$defs/PlayerId, ASCII digits only


def is_player_id(value: Any) -> bool:
    return isinstance(value, str) and PLAYER_ID.fullmatch(value) is not None


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
        .annotate(
            seated=Count("seats", distinct=True),
            unfinished_hand=Exists(Hand.objects.filter(room=OuterRef("pk"), completed_at=None)),
        )
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
        if settings.get("bomb_pot_every", 0) > 0 and not settings.get("bomb_pot_amount"):
            raise BadRequest({"bomb_pot_amount": [actor_module.BOMB_POT_NEEDS_AMOUNT]})
        ROOMS_PER_USER.hit(str(user.pk))
    except BadRequest as exc:
        return error("validation_error", "Invalid body.", exc.fields)
    except RateLimited as exc:
        return rate_limited(exc)
    # Only the E2E server makes rooms that deal at once (settings.ROOMS_START_RUNNING).
    running = django_settings.ROOMS_START_RUNNING
    room = await Room.objects.acreate(
        owner=user, invite_token=new_invite_token(), running=running, **settings
    )
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


async def _owned_room(
    request: HttpRequest, room_id: int, method: str = "POST"
) -> tuple[Room, Any] | JsonResponse:
    if request.method != method:
        return error("method_not_allowed", f"{method} only.")
    user = await request.auser()
    if not user.is_authenticated:
        return error("not_authenticated", "Log in first.")
    room = await visible_room(room_id, user)
    if isinstance(room, JsonResponse):
        return room
    if room.owner_id != user.pk and not user.is_staff:
        return error("forbidden", "Only the room's owner can do this.")
    return room, user


async def log_action(room: Room, user, kind: str, details: dict[str, Any]) -> None:
    """Record an owner power used, by the owner or by staff (B8 audit log)."""
    await OwnerAction.objects.acreate(
        room=room, user=user, by_staff=room.owner_id != user.pk, kind=kind, details=details
    )


def _reject_response(reject: actor_module.Reject) -> JsonResponse:
    if reject.code == "validation_error":
        field = reject.field or "non_field_errors"
        return error("validation_error", str(reject), {field: [str(reject)]})
    return error(reject.code, str(reject))


async def _update(request: HttpRequest, room_id: int) -> JsonResponse:
    owned = await _owned_room(request, room_id, method="PATCH")
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
    await log_action(room, user, OwnerAction.Kind.SETTINGS, changes)
    return JsonResponse(room_detail(room, user))


async def grant_chips(request: HttpRequest, room_id: int) -> JsonResponse:
    owned = await _owned_room(request, room_id)
    if isinstance(owned, JsonResponse):
        return owned
    room, user = owned
    try:
        body = read_json(request)
        player_id, amount = body.get("player_id"), body.get("amount")
        fields = {}
        if not is_player_id(player_id):
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
    await log_action(room, user, OwnerAction.Kind.GRANT, {"player_id": player_id, "amount": amount})
    return JsonResponse({"player_id": player_id, "amount": amount, "balance": balance})


async def start(request: HttpRequest, room_id: int) -> JsonResponse:
    """The owner's Start: hands are dealt (after a countdown) until Pause. Already running: no
    countdown is shortened; a table standing still (no hand, nothing counting, ready) counts down
    again."""
    return await _start_or_pause(request, room_id, start=True)


async def pause(request: HttpRequest, room_id: int) -> JsonResponse:
    """The owner's Pause: the countdown stops, a running hand is played out, then no new one.
    Already paused: nothing changes."""
    return await _start_or_pause(request, room_id, start=False)


async def _start_or_pause(request: HttpRequest, room_id: int, start: bool) -> JsonResponse:
    owned = await _owned_room(request, room_id)
    if isinstance(owned, JsonResponse):
        return owned
    room, user = owned
    live = await actor_module.get_actor(room.pk)
    try:
        changed, info = await (live.start() if start else live.pause())
    except actor_module.Reject as reject:
        return _reject_response(reject)
    if changed:  # pressed again in the same state: nothing happened, nothing to log
        kind = OwnerAction.Kind.START if start else OwnerAction.Kind.PAUSE
        await log_action(room, user, kind, {})
    return JsonResponse(info)


async def kick(request: HttpRequest, room_id: int) -> JsonResponse:
    owned = await _owned_room(request, room_id)
    if isinstance(owned, JsonResponse):
        return owned
    room, user = owned
    try:
        body = read_json(request)
        player_id = body.get("player_id")
        if not is_player_id(player_id) or set(body) != {"player_id"}:
            raise BadRequest({"player_id": ["A player_id string."]})
        if int(player_id) in (user.pk, room.owner_id):
            raise BadRequest({"player_id": ["Nobody can kick the owner (or themselves)."]})
    except BadRequest as exc:
        return error("validation_error", "Invalid body.", exc.fields)
    if await User.objects.filter(pk=int(player_id), is_staff=True).aexists():
        # Staff act as owners everywhere; a ban would only half work for them (REST lets them
        # in, the WebSocket would not).
        return error("validation_error", "Staff cannot be kicked.", {"player_id": ["Staff."]})
    if not await User.objects.filter(pk=int(player_id)).aexists():
        return error("validation_error", "No such player.", {"player_id": ["No such player."]})
    live = await actor_module.get_actor(room.pk)
    try:
        await live.kick(int(player_id))
    except actor_module.Reject as reject:
        return _reject_response(reject)
    details: dict[str, Any] = {"player_id": player_id}
    if room.is_private:
        # The ban stops the account, not the same person opening the old link as a new guest.
        # A public room has no link to change: there a kick stops the account only (spec.md).
        room.invite_token = new_invite_token()
        await room.asave(update_fields=["invite_token"])
        details["invite_rotated"] = True
    await log_action(room, user, OwnerAction.Kind.KICK, details)
    return JsonResponse(None, status=204, safe=False)


async def close(request: HttpRequest, room_id: int) -> JsonResponse:
    owned = await _owned_room(request, room_id)
    if isinstance(owned, JsonResponse):
        return owned
    room, user = owned
    live = await actor_module.get_actor(room.pk)
    try:
        closed_now = await live.close()
    except actor_module.Reject as reject:
        return _reject_response(reject)
    await log_action(room, user, OwnerAction.Kind.CLOSE, {"immediately": closed_now})
    return JsonResponse(room_detail(room, user), status=200 if closed_now else 202)


async def rotate_invite(request: HttpRequest, room_id: int) -> JsonResponse:
    owned = await _owned_room(request, room_id)
    if isinstance(owned, JsonResponse):
        return owned
    room, user = owned
    room.invite_token = new_invite_token()
    await room.asave(update_fields=["invite_token"])
    await log_action(room, user, OwnerAction.Kind.INVITE, {})
    return JsonResponse(room_detail(room, user))


async def join(request: HttpRequest) -> JsonResponse:
    if request.method != "POST":
        return error("method_not_allowed", "POST.")
    ip = client_ip(request)
    try:
        # Only wrong tokens count (below): friends at one table share a Wi-Fi, so one IP, and
        # each of them opens the invite link, maybe several times.
        JOINS_PER_IP.check(ip)
    except RateLimited as exc:
        return rate_limited(exc)
    try:
        token = read_json(request).get("invite_token")
        if not isinstance(token, str) or not 1 <= len(token) <= 64:
            raise BadRequest({"invite_token": ["Required."]})
    except BadRequest as exc:
        return error("validation_error", "Invalid body.", exc.fields)
    room = await Room.objects.select_related("owner").filter(invite_token=token).afirst()
    if room is None:
        JOINS_PER_IP.hit(ip)
        return error("room_not_found", "Bad or old invite link.")
    try:
        user = await player_for_request(request)
    except RateLimited as exc:
        return rate_limited(exc)
    if await RoomBan.objects.filter(room=room, user=user).aexists():
        return error("kicked", "The owner removed you from this room.")
    if room.status == Room.Status.CLOSED:
        return error("room_closed", "This room is closed.")
    await sync_to_async(RoomMember.objects.get_or_create)(room=room, user=user)
    return JsonResponse(room_detail(room, user))
