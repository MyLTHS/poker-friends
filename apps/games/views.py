"""Minimal REST for B4 (docs/api/openapi.yaml): take/leave a seat (or stay), read a snapshot.

Mutations go through the room's ``TableActor`` so they are ordered with WebSocket commands by
the same single writer (ADR-001); only ``get_snapshot`` reads the actor directly.
"""

import json

from django.http import HttpRequest, HttpResponseNotAllowed, JsonResponse
from django.views.decorators.csrf import ensure_csrf_cookie

from apps.accounts.ratelimit import RateLimited

from . import actor as actor_module
from . import rooms
from .accounts import player_for_request
from .models import Room, User

CONFLICT_CODES = {
    "already_seated",
    "seat_taken",
    "not_seated",
    "player_in_hand",
    "has_chips",
    "room_closed",
    "room_suspended",
}


def _error(code: str, message: str, status: int) -> JsonResponse:
    return JsonResponse({"code": code, "message": message}, status=status)


async def _player_in_room(request: HttpRequest, room_id: int) -> tuple[Room, User] | JsonResponse:
    """The room and the caller (a new logged-in guest if needed), if the caller may see it."""
    room = await Room.objects.filter(pk=room_id).afirst()
    if room is None:
        return _error("room_not_found", "No such room.", 404)
    user = await request.auser()
    if room.is_private and not user.is_authenticated:
        return _error("room_not_found", "No such room.", 404)  # no guest for nothing
    try:
        user = await player_for_request(request)
    except RateLimited as exc:
        return rooms.rate_limited(exc)
    verdict = await rooms.access(room, user)
    if verdict == "hidden":
        return _error("room_not_found", "No such room.", 404)
    if verdict == "kicked":
        return _error("kicked", "The owner removed you from this room.", 403)
    return room, user


def _count_seat_change(user: User) -> JsonResponse | None:
    try:
        rooms.SEAT_CHANGES_PER_PLAYER.hit(str(user.pk))
    except RateLimited as exc:
        return rooms.rate_limited(exc)
    return None


def _status_for(code: str) -> int:
    if code in CONFLICT_CODES:
        return 409
    if code == "kicked":
        return 403
    if code == "invalid_seat":
        return 400
    return 400


async def take_seat(request: HttpRequest, room_id: int) -> JsonResponse:
    if request.method != "POST":
        return HttpResponseNotAllowed(["POST"])
    found = await _player_in_room(request, room_id)
    if isinstance(found, JsonResponse):
        return found
    _, user = found
    if limited := _count_seat_change(user):
        return limited
    try:
        body = json.loads(request.body or b"{}")
        seat = int(body["seat"])
    except (TypeError, ValueError, KeyError):
        return _error("validation_error", "seat (int) is required.", 400)

    act = await actor_module.get_actor(room_id)
    try:
        occupant = await act.take_seat(user, seat)
    except actor_module.Reject as reject:
        return _error(reject.code, str(reject), _status_for(reject.code))
    return JsonResponse(occupant, status=201)


async def leave_seat(request: HttpRequest, room_id: int) -> JsonResponse:
    if request.method != "DELETE":
        return HttpResponseNotAllowed(["DELETE"])
    found = await _player_in_room(request, room_id)
    if isinstance(found, JsonResponse):
        return found
    _, user = found
    if limited := _count_seat_change(user):
        return limited
    act = await actor_module.get_actor(room_id)
    try:
        left_now = await act.leave_seat(user)
    except actor_module.Reject as reject:
        return _error(reject.code, str(reject), _status_for(reject.code))
    if not left_now:  # in the running hand: the seat is freed when it ends
        return JsonResponse({"leaving": True}, status=202)
    return JsonResponse(None, status=204, safe=False)


async def stay(request: HttpRequest, room_id: int) -> JsonResponse:
    """Take back a leave asked during the hand: the player keeps the seat after it."""
    if request.method != "POST":
        return HttpResponseNotAllowed(["POST"])
    if not (await request.auser()).is_authenticated:  # no guest made just to be told that
        return _error("not_seated", "Sit down first.", 409)
    found = await _player_in_room(request, room_id)
    if isinstance(found, JsonResponse):
        return found
    _, user = found
    if limited := _count_seat_change(user):
        return limited
    act = await actor_module.get_actor(room_id)
    try:
        occupant = await act.stay(user)
    except actor_module.Reject as reject:
        return _error(reject.code, str(reject), _status_for(reject.code))
    return JsonResponse(occupant)


async def rebuy(request: HttpRequest, room_id: int) -> JsonResponse:
    """A seated player with no chips left takes the room's starting stack again (no owner)."""
    if request.method != "POST":
        return HttpResponseNotAllowed(["POST"])
    if not (await request.auser()).is_authenticated:  # no guest made just to be told that
        return _error("not_seated", "Sit down first.", 409)
    found = await _player_in_room(request, room_id)
    if isinstance(found, JsonResponse):
        return found
    _, user = found
    act = await actor_module.get_actor(room_id)
    try:
        balance = await act.rebuy(str(user.pk))
    except actor_module.Reject as reject:
        return _error(reject.code, str(reject), _status_for(reject.code))
    # Only from zero, so the grant is the whole new stack (GrantChipsResult in the API).
    return JsonResponse({"player_id": str(user.pk), "amount": balance, "balance": balance})


@ensure_csrf_cookie  # the first GET hands out the csrftoken the POST/DELETE calls must echo
async def get_snapshot(request: HttpRequest, room_id: int) -> JsonResponse:
    if request.method != "GET":
        return HttpResponseNotAllowed(["GET"])
    found = await _player_in_room(request, room_id)
    if isinstance(found, JsonResponse):
        return found
    _, user = found
    act = await actor_module.get_actor(room_id)
    message = act.snapshot_message(str(user.pk))
    return JsonResponse(
        {
            "version": message["version"],
            "server_time": message["server_time"],
            "table": message["payload"]["table"],
        }
    )
