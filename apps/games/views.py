"""Minimal REST for B4 (docs/api/openapi.yaml): take/leave a seat, read a snapshot.

Mutations go through the room's ``TableActor`` so they are ordered with WebSocket commands by
the same single writer (ADR-001); only ``get_snapshot`` reads the actor directly.
"""

import json

from django.http import HttpRequest, HttpResponseNotAllowed, JsonResponse
from django.views.decorators.csrf import ensure_csrf_cookie

from . import actor as actor_module
from . import rooms
from .accounts import player_for_request
from .models import Room, User

CONFLICT_CODES = {"already_seated", "seat_taken", "not_seated", "player_in_hand", "room_closed"}


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
    user = await player_for_request(request)
    verdict = await rooms.access(room, user)
    if verdict == "hidden":
        return _error("room_not_found", "No such room.", 404)
    if verdict == "kicked":
        return _error("kicked", "The owner removed you from this room.", 403)
    return room, user


def _status_for(code: str) -> int:
    if code in CONFLICT_CODES:
        return 409
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
    act = await actor_module.get_actor(room_id)
    try:
        await act.leave_seat(user)
    except actor_module.Reject as reject:
        return _error(reject.code, str(reject), _status_for(reject.code))
    return JsonResponse(None, status=204, safe=False)


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
