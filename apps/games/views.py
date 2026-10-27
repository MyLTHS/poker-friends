"""Minimal REST for B4 (docs/api/openapi.yaml): take/leave a seat, read a snapshot.

Mutations go through the room's ``TableActor`` so they are ordered with WebSocket commands by
the same single writer (ADR-001); only ``get_snapshot`` reads the actor directly.
"""

import json

from django.http import HttpRequest, HttpResponseNotAllowed, JsonResponse
from django.views.decorators.csrf import ensure_csrf_cookie

from . import actor as actor_module
from .accounts import player_for_request
from .models import Room

CONFLICT_CODES = {"already_seated", "seat_taken", "not_seated", "player_in_hand", "room_closed"}


def _error(code: str, message: str, status: int) -> JsonResponse:
    return JsonResponse({"code": code, "message": message}, status=status)


async def _room_or_404(room_id: int) -> Room | None:
    try:
        return await Room.objects.aget(pk=room_id)
    except Room.DoesNotExist:
        return None


def _status_for(code: str) -> int:
    if code in CONFLICT_CODES:
        return 409
    if code == "invalid_seat":
        return 400
    return 400


async def take_seat(request: HttpRequest, room_id: int) -> JsonResponse:
    if request.method != "POST":
        return HttpResponseNotAllowed(["POST"])
    if await _room_or_404(room_id) is None:
        return _error("room_not_found", "No such room.", 404)
    try:
        body = json.loads(request.body or b"{}")
        seat = int(body["seat"])
    except (TypeError, ValueError, KeyError):
        return _error("validation_error", "seat (int) is required.", 400)

    user = await player_for_request(request)
    act = await actor_module.get_actor(room_id)
    try:
        occupant = await act.take_seat(user, seat)
    except actor_module.Reject as reject:
        return _error(reject.code, str(reject), _status_for(reject.code))
    return JsonResponse(occupant, status=201)


async def leave_seat(request: HttpRequest, room_id: int) -> JsonResponse:
    if request.method != "DELETE":
        return HttpResponseNotAllowed(["DELETE"])
    if await _room_or_404(room_id) is None:
        return _error("room_not_found", "No such room.", 404)
    user = await player_for_request(request)
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
    if await _room_or_404(room_id) is None:
        return _error("room_not_found", "No such room.", 404)
    user = await player_for_request(request)
    act = await actor_module.get_actor(room_id)
    message = act.snapshot_message(str(user.pk))
    return JsonResponse(
        {
            "version": message["version"],
            "server_time": message["server_time"],
            "table": message["payload"]["table"],
        }
    )
