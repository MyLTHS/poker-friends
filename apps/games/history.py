"""B8 REST, read-only: chat history, hand history, replay and the profit/loss summary.

Anyone who may see the room (``rooms.access``) may read these. A replay rebuilds a finished hand
from its stored config and commands and projects every step for the caller with
``HandEngine.view_for``, so another player's face-down cards are never in the answer: the caller
sees their own cards (if they were dealt in) and cards shown by the time of that step.
"""

from collections import defaultdict
from typing import Any

from asgiref.sync import sync_to_async
from django.http import HttpRequest, JsonResponse

from . import contract
from .actor import TIMEOUT_COMMAND_PREFIX, iso
from .engine.hand import Action, ActionKind, HandEngine
from .models import ChatMessage, Hand, LedgerEntry, LedgerKind, User
from .rooms import access, error, visible_room

CHAT_HISTORY = 50
HANDS_LISTED = 100


def _get_only(request: HttpRequest) -> JsonResponse | None:
    return None if request.method == "GET" else error("method_not_allowed", "GET.")


async def chat_history(request: HttpRequest, room_id: int) -> JsonResponse:
    if refused := _get_only(request):
        return refused
    room = await visible_room(room_id, await request.auser())
    if isinstance(room, JsonResponse):
        return room
    latest = ChatMessage.objects.filter(room=room).select_related("user").order_by("-id")
    lines = [line async for line in latest[:CHAT_HISTORY]]
    messages = [
        {
            "message_id": line.pk,
            "player_id": str(line.user_id),
            "display_name": line.user.username,
            "text": line.text,
            "sent_at": iso(line.created_at),
        }
        for line in reversed(lines)
    ]
    return JsonResponse({"messages": messages})


def _seats(hand: Hand) -> dict[str, int]:
    return {seat["player_id"]: seat["seat"] for seat in hand.config["seats"]}


def _is_voided(hand: Hand) -> bool:
    return bool(hand.result and hand.result.get("voided"))


async def _names(player_ids) -> dict[str, str]:
    users = User.objects.filter(pk__in=[int(p) for p in player_ids])
    return {str(u.pk): u.username async for u in users}


async def list_hands(request: HttpRequest, room_id: int) -> JsonResponse:
    if refused := _get_only(request):
        return refused
    room = await visible_room(room_id, await request.auser())
    if isinstance(room, JsonResponse):
        return room
    finished = Hand.objects.filter(room=room, completed_at__isnull=False).order_by("-hand_no")
    hands = [hand async for hand in finished[:HANDS_LISTED]]
    nets: dict[int, dict[str, int]] = defaultdict(lambda: defaultdict(int))
    entries = LedgerEntry.objects.filter(hand__in=hands).values("hand_id", "user_id", "amount")
    async for entry in entries:
        nets[entry["hand_id"]][str(entry["user_id"])] += entry["amount"]
    names = await _names({p for hand in hands for p in _seats(hand) | nets[hand.pk].keys()})
    rows = []
    for hand in hands:
        voided = _is_voided(hand)
        seats = _seats(hand)
        # Dealt-in players, plus anyone else with an entry in this hand: a player sitting out
        # still pays the 7-2 bonus (rule #27), so the hand only sums to 0 with them.
        involved = sorted(
            set(seats) | set(nets[hand.pk]), key=lambda p: (p not in seats, seats.get(p, 0), int(p))
        )
        players = (
            []
            if voided
            else [
                {
                    "player_id": player,
                    "display_name": names.get(player, player),
                    "seat": seats.get(player),
                    "net": nets[hand.pk].get(player, 0),
                }
                for player in involved
            ]
        )
        rows.append(
            {
                "hand_id": hand.pk,
                "hand_no": hand.hand_no,
                "completed_at": iso(hand.completed_at),
                "voided": voided,
                "players": players,
            }
        )
    return JsonResponse({"hands": rows})


def replay_steps(
    hand: Hand, viewer: str | None
) -> tuple[list[dict[str, Any]], str | None, list[dict[str, Any]]]:
    """Every state of ``hand`` as ``viewer`` saw it, from the deal to the end, the 7-2 bluff
    winner by rule #27 (even when nobody had chips left to pay the bonus) and the hands named
    at the showdown (the same for everyone: only cards shown to the whole table)."""
    engine = HandEngine.replay({"config": hand.config, "actions": []})
    seated = viewer if viewer in engine.player_order else None
    seats = _seats(hand)

    def view() -> dict[str, Any]:
        state = {"hand_id": hand.pk, "hand_no": hand.hand_no, **engine.view_for(seated)}
        # Defence in depth: the same check every live message goes through.
        problems = contract.hand_view_errors(state, seated)
        if problems:
            raise RuntimeError(f"replay of hand {hand.pk} would leak: {problems}")
        state["legal_actions"] = None  # nobody acts in a replay
        return state

    steps = [{"action": None, "hand": view()}]
    for command in hand.commands.all():
        player = str(command.player_id)
        engine.act(Action(player, ActionKind(command.kind), command.amount))
        applied = {
            "player_id": player,
            "seat": seats[player],
            "kind": command.kind,
            "amount": command.amount,
            # Only the clock's own commands: clients cannot send ":" in a command_id.
            "timeout": command.command_id.startswith(TIMEOUT_COMMAND_PREFIX),
        }
        steps.append({"action": applied, "hand": view()})
    winner = engine.seven_deuce_bluff_winner() if hand.config.get("seven_deuce_bonus") else None
    return steps, winner, engine.showdown_hands()


async def hand_replay(request: HttpRequest, hand_id: int) -> JsonResponse:
    if refused := _get_only(request):
        return refused
    user = await request.auser()
    hand = await Hand.objects.select_related("room").filter(pk=hand_id).afirst()
    if hand is None or hand.completed_at is None or await access(hand.room, user) != "ok":
        return error("hand_not_found", "No such finished hand.")
    if _is_voided(hand):
        return error("hand_voided", "This hand was voided by an admin.")
    viewer = str(user.pk) if user.is_authenticated else None
    # Replaying touches the ORM (hand.commands) and PokerKit: run it off the event loop.
    steps, winner, showdown = await sync_to_async(replay_steps)(hand, viewer)

    hand_net: dict[str, int] = defaultdict(int)
    bonus_net: dict[str, int] = defaultdict(int)
    async for entry in LedgerEntry.objects.filter(hand=hand):
        target = bonus_net if entry.kind == LedgerKind.SEVEN_DEUCE else hand_net
        target[str(entry.user_id)] += entry.amount
    players = set(_seats(hand)) | set(bonus_net)
    names = await _names(players)
    results = [
        {
            "player_id": p,
            "display_name": names.get(p, p),
            "hand_net": hand_net.get(p, 0),
            "seven_deuce_net": bonus_net.get(p, 0),
        }
        for p in sorted(players, key=int)
    ]
    return JsonResponse(
        {
            "hand_id": hand.pk,
            "hand_no": hand.hand_no,
            "room_id": hand.room_id,
            "completed_at": iso(hand.completed_at),
            "steps": steps,
            "results": results,
            "seven_deuce_winner": winner,
            "showdown": showdown,
        }
    )


async def room_summary(request: HttpRequest, room_id: int) -> JsonResponse:
    if refused := _get_only(request):
        return refused
    room = await visible_room(room_id, await request.auser())
    if isinstance(room, JsonResponse):
        return room
    totals: dict[str, dict[str, int]] = defaultdict(lambda: defaultdict(int))
    async for entry in LedgerEntry.objects.filter(room=room).values("user_id", "kind", "amount"):
        totals[str(entry["user_id"])][entry["kind"]] += entry["amount"]
    played: dict[str, int] = defaultdict(int)
    finished = Hand.objects.filter(room=room, completed_at__isnull=False)
    async for hand in finished:
        if not _is_voided(hand):
            for player in _seats(hand):
                played[player] += 1
    names = await _names(totals)
    rows = []
    for player in sorted(totals, key=int):
        kinds = totals[player]
        granted = kinds[LedgerKind.GRANT]
        hands = kinds[LedgerKind.HAND]
        bonus = kinds[LedgerKind.SEVEN_DEUCE]
        rows.append(
            {
                "player_id": player,
                "display_name": names.get(player, player),
                "granted": granted,
                "hands_net": hands,
                "seven_deuce_net": bonus,
                "balance": granted + hands + bonus,
                "net": hands + bonus,
                "hands_played": played[player],
            }
        )
    return JsonResponse({"players": rows})
