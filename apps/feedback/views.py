"""POST /api/feedback/ and POST /api/client-errors/ (docs/api/openapi.yaml, tag feedback).

Both only write. There is no endpoint to read them back: staff use the Django admin.
"""

import hashlib
from datetime import UTC, datetime, timedelta
from typing import Any

from asgiref.sync import sync_to_async
from django.db import IntegrityError, transaction
from django.db.models import F
from django.http import HttpRequest, HttpResponse, JsonResponse
from django.utils import timezone

from apps.accounts.ratelimit import RateLimit, RateLimited
from apps.accounts.views import client_ip
from apps.games.models import Room
from apps.games.rooms import BadRequest, access, error, rate_limited, read_json

from .models import ClientError, Feedback
from .scrub import scrub

FEEDBACK_PER_USER = RateLimit("feedback-user", limit=10, window=60 * 60)
# A broken page can throw in a loop: cap what one browser can write. The per-player cap is lower
# so one player cannot use up the address everyone at a party shares.
CLIENT_ERRORS_PER_USER = RateLimit("client-errors-user", limit=30, window=10 * 60)
CLIENT_ERRORS_PER_IP = RateLimit("client-errors-ip", limit=60, window=10 * 60)

FEEDBACK_MESSAGE_MAX = 2000
PAGE_MAX = 500
USER_AGENT_MAX = 500
# Longer client-error fields are cut, not refused: a long stack is still worth keeping.
CLIENT_ERROR_LIMITS = {
    "message": 1000,
    "stack": 8000,
    "page": PAGE_MAX,
    "user_agent": USER_AGENT_MAX,
    "release": 64,
}
DUPLICATE_WINDOW = timedelta(minutes=10)
# Not logged in, a new message each time and a new IPv6 address get round every limit above: the
# table still takes at most this many new rows a day (repeats only count, they add no row).
# Counted from the database, so a restart does not reset it. ~10 kB a row at most.
CLIENT_ERRORS_MAX_NEW_PER_DAY = 1000
NEW_ROWS_PERIOD = timedelta(hours=24)


def _user_agent(request: HttpRequest) -> str:
    return request.META.get("HTTP_USER_AGENT", "")[:USER_AGENT_MAX]


async def feedback(request: HttpRequest) -> JsonResponse:
    if request.method != "POST":
        return error("method_not_allowed", "POST.")
    user = await request.auser()
    if not user.is_authenticated:
        return error("not_authenticated", "Log in (a guest is fine) to send feedback.")
    try:
        FEEDBACK_PER_USER.hit(str(user.pk))
    except RateLimited as exc:
        return rate_limited(exc)
    try:
        clean = await _clean_feedback(read_json(request), user)
    except BadRequest as exc:
        return error("validation_error", "Invalid body.", exc.fields)
    item = await Feedback.objects.acreate(user=user, user_agent=_user_agent(request), **clean)
    return JsonResponse({"feedback_id": item.pk}, status=201)


async def _clean_feedback(body: dict[str, Any], user) -> dict[str, Any]:
    fields: dict[str, list[str]] = {}
    for key in set(body) - {"kind", "message", "page", "room_id"}:
        fields[key] = ["Unknown field."]
    kind = body.get("kind")
    if kind not in Feedback.Kind.values:
        fields["kind"] = [f"One of {', '.join(Feedback.Kind.values)}."]
    message = body.get("message")
    if not isinstance(message, str) or not message.strip():
        fields["message"] = ["Required."]
    elif len(message.strip()) > FEEDBACK_MESSAGE_MAX:
        fields["message"] = [f"At most {FEEDBACK_MESSAGE_MAX} characters."]
    page = body.get("page", "")
    if not isinstance(page, str) or len(page) > PAGE_MAX:
        fields["page"] = [f"A path of at most {PAGE_MAX} characters."]
    room = None
    room_id = body.get("room_id")
    if room_id is not None:
        if not isinstance(room_id, int) or isinstance(room_id, bool):
            fields["room_id"] = ["A room id (integer) or nothing."]
        else:
            room = await Room.objects.filter(pk=room_id).afirst()
            # A private room this player cannot see answers like a missing one.
            if room is None or await access(room, user) != "ok":
                fields["room_id"] = ["No such room."]
    if fields:
        raise BadRequest(fields)
    # A pasted invite or reset link carries its token: scrub what the player wrote too. Cut after
    # scrubbing: "[đã xoá]" can be longer than the token it replaced.
    return {
        "kind": kind,
        "message": scrub(message.strip())[:FEEDBACK_MESSAGE_MAX],
        "page": scrub(page)[:PAGE_MAX],
        "room": room,
    }


async def client_errors(request: HttpRequest) -> HttpResponse:
    if request.method != "POST":
        return error("method_not_allowed", "POST.")
    user = await request.auser()
    try:
        # The player's own cap first: a refused report then does not count against the address
        # the whole party shares.
        if user.is_authenticated:
            CLIENT_ERRORS_PER_USER.hit(str(user.pk))
        CLIENT_ERRORS_PER_IP.hit(client_ip(request))
    except RateLimited as exc:
        return rate_limited(exc)
    try:
        report = _clean_client_error(read_json(request), request)
    except BadRequest as exc:
        return error("validation_error", "Invalid body.", exc.fields)
    try:
        await _record(report, user if user.is_authenticated else None)
    except RateLimited as exc:
        return rate_limited(exc)
    return HttpResponse(status=204)


def _clean_client_error(body: dict[str, Any], request: HttpRequest) -> dict[str, str]:
    fields: dict[str, list[str]] = {}
    for key in set(body) - set(CLIENT_ERROR_LIMITS):
        fields[key] = ["Unknown field."]
    report: dict[str, str] = {}
    for key, limit in CLIENT_ERROR_LIMITS.items():
        value = body.get(key, "")
        if not isinstance(value, str):
            fields[key] = ["Must be a string."]
            continue
        # Scrub first, then cut: a secret cut in half would no longer match the patterns.
        report[key] = scrub(value)[:limit]
    if not report.get("message", "").strip() and "message" not in fields:
        fields["message"] = ["Required."]
    if fields:
        raise BadRequest(fields)
    if not report["user_agent"]:
        report["user_agent"] = _user_agent(request)
    return report


def _window_start(now: datetime) -> datetime:
    """The fixed window ``now`` falls in (10:00, 10:10 …): one row per error per window."""
    step = int(DUPLICATE_WINDOW.total_seconds())
    return datetime.fromtimestamp(int(now.timestamp()) // step * step, tz=UTC)


def _fingerprint(report: dict[str, str]) -> str:
    """Which error this is: the same message on the same page of the same release."""
    text = "\n".join((report["message"], report["page"], report["release"]))
    return hashlib.sha256(text.encode()).hexdigest()


def _count_again(fingerprint: str, window: datetime, now: datetime) -> int:
    """Count one more report on the window's row; 0 when there is no row yet."""
    same = ClientError.objects.filter(fingerprint=fingerprint, window_start=window)
    return same.update(count=F("count") + 1, last_seen=now)


def _check_room_for_a_new_row(now: datetime) -> None:
    """Raise ``RateLimited`` when the last 24 hours already made the most new rows; a slot
    frees up when the oldest of them turns 24 hours old."""
    recent = ClientError.objects.filter(first_seen__gt=now - NEW_ROWS_PERIOD)
    if recent.count() < CLIENT_ERRORS_MAX_NEW_PER_DAY:
        return
    oldest = recent.order_by("first_seen").values_list("first_seen", flat=True).first()
    raise RateLimited(max(60, int((oldest + NEW_ROWS_PERIOD - now).total_seconds())))


@sync_to_async
def _record(report: dict[str, str], user) -> None:
    now = timezone.now()
    window = _window_start(now)
    fingerprint = _fingerprint(report)
    if _count_again(fingerprint, window, now):
        return
    _check_room_for_a_new_row(now)
    try:
        # A savepoint: another report of the same error may create the row first, and then
        # the unique (fingerprint, window_start) constraint sends this one to count on it.
        with transaction.atomic():
            ClientError.objects.create(
                fingerprint=fingerprint, window_start=window, last_seen=now, user=user, **report
            )
    except IntegrityError:
        _count_again(fingerprint, window, now)
