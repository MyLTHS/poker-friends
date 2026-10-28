"""The WebSocket contract from docs/api/: load the JSON Schemas and check messages against them.

Pure Python (no Django), so the mock server, tests and the future Channels consumer can all
use it. The schemas reference each other by relative file path; each file is registered under
its own ``file://`` URI so those references resolve the same way here as in the TypeScript
generator.
"""

import json
from functools import cache
from pathlib import Path
from typing import Any, Literal

from jsonschema import Draft202012Validator
from pokerkit import StandardHighHand
from referencing import Registry, Resource

API_DIR = Path(__file__).resolve().parents[2] / "docs" / "api"
SCHEMA_DIR = API_DIR / "schema"

Direction = Literal["server", "client"]
DIRECTIONS: tuple[Direction, ...] = ("server", "client")

MESSAGE_TYPES: dict[Direction, list[str]] = {
    "server": [
        "table.snapshot",
        "hand.started",
        "action.applied",
        "turn.deadline",
        "hand.completed",
        "seat.updated",
        "room.suspended",
        "room.updated",
        "chat.message",
        "audience.updated",
        "command.ack",
        "command.rejected",
        "protocol.error",
    ],
    "client": ["command.act", "command.sit_out", "command.sit_in", "resync.request", "chat.send"],
}

# Server messages that change the room and add 1 to its version; every other server message
# is a reply to one connection and carries the current version unchanged.
STATE_EVENTS = frozenset(
    {
        "hand.started",
        "action.applied",
        "turn.deadline",
        "hand.completed",
        "seat.updated",
        "room.suspended",
        "room.updated",
    }
)


class ContractError(ValueError):
    def __init__(self, direction: Direction, errors: list[str]):
        super().__init__(f"{direction} message breaks the contract: " + "; ".join(errors))
        self.errors = errors


def _load(path: Path) -> dict[str, Any]:
    return json.loads(path.read_text())


@cache
def _registry() -> Registry:
    resources = []
    for path in SCHEMA_DIR.rglob("*.schema.json"):
        contents = {"$id": path.as_uri(), **_load(path)}
        resources.append((path.as_uri(), Resource.from_contents(contents)))
    return Registry().with_resources(resources)


@cache
def _validator(path: Path) -> Draft202012Validator:
    schema = _registry().contents(path.as_uri())
    return Draft202012Validator(schema, registry=_registry())


def message_validator(message_type: str) -> Draft202012Validator:
    return _validator(SCHEMA_DIR / "messages" / f"{message_type}.schema.json")


def union_validator(direction: Direction) -> Draft202012Validator:
    return _validator(SCHEMA_DIR / f"{direction}-message.schema.json")


def matches(value: Any, definition: str) -> bool:
    """Whether ``value`` fits one definition of common.schema.json, e.g. ``"CommandId"``."""
    common = (SCHEMA_DIR / "common.schema.json").as_uri()
    schema = {"$ref": f"{common}#/$defs/{definition}"}
    return Draft202012Validator(schema, registry=_registry()).is_valid(value)


def enum(name: str) -> list[str]:
    """Values of an enum defined in common.schema.json, e.g. ``enum("RejectCode")``."""
    return list(_load(SCHEMA_DIR / "common.schema.json")["$defs"][name]["enum"])


def errors(message: Any, direction: Direction) -> list[str]:
    """Readable contract violations of ``message``; empty when it is valid.

    A known ``type`` is checked against its own schema, which gives precise errors; anything
    else against the union of all messages of that direction.
    """
    message_type = message.get("type") if isinstance(message, dict) else None
    if message_type in MESSAGE_TYPES[direction]:
        validator = message_validator(message_type)
    else:
        validator = union_validator(direction)
    return [
        f"{'/'.join(str(p) for p in error.absolute_path) or '<root>'}: {error.message}"
        for error in sorted(
            validator.iter_errors(message), key=lambda e: [str(p) for p in e.absolute_path]
        )
    ]


def validate(message: Any, direction: Direction) -> None:
    found = errors(message, direction)
    if found:
        raise ContractError(direction, found)


# ---- semantics ---------------------------------------------------------------------------
#
# JSON Schema checks the shape of a message, not whether it is safe to send to one person: a
# snapshot showing an opponent's hole cards has a perfectly valid shape. These checks know who
# the receiver is. They are a second lock behind HandEngine.view_for, run on every message
# before it leaves the server; they are not a substitute for building messages with view_for.

HIDDEN = "??"
SECRET_KEYS = frozenset({"deck", "burn", "burned", "burn_cards", "undealt"})


def hand_view_errors(hand: dict[str, Any], viewer: str) -> list[str]:
    """What ``viewer`` must not see, or must see, in one ``HandView``."""
    found = []
    complete = hand["complete"]
    seen: list[str] = list(hand["board"])
    for player in hand["players"]:
        pid, cards = player["player_id"], player["cards"]
        where = f"hand/players/{pid}"
        if not player["in_hand"]:
            if cards:
                found.append(f"{where}: folded or mucked cards must be [], got {cards}")
        elif pid == viewer:
            if HIDDEN in cards:
                found.append(f"{where}: the receiver's own cards must be face up")
        elif not complete and any(card != HIDDEN for card in cards):
            found.append(f"{where}: another player's cards shown while the hand runs")
        elif complete and HIDDEN in cards and any(card != HIDDEN for card in cards):
            found.append(f"{where}: cards are half shown")
        seen += [card for card in cards if card != HIDDEN]
    duplicates = sorted({card for card in seen if seen.count(card) > 1})
    if duplicates:
        found.append(f"hand: cards appear twice: {duplicates}")
    actor = hand["actor"]
    if complete and actor is not None:
        found.append("hand: a complete hand has no actor")
    is_actor = actor == viewer and not complete
    if hand["legal_actions"] is not None and not is_actor:
        found.append("hand/legal_actions: only the player to act gets legal_actions")
    if is_actor and hand["legal_actions"] is None:
        found.append("hand/legal_actions: the player to act needs legal_actions")
    return found


def _secret_keys(value: Any, path: str = "") -> list[str]:
    if isinstance(value, dict):
        found = [f"{path}/{key}: never send {key}" for key in value if key in SECRET_KEYS]
        for key, item in value.items():
            found += _secret_keys(item, f"{path}/{key}")
        return found
    if isinstance(value, list):
        return [
            error for i, item in enumerate(value) for error in _secret_keys(item, f"{path}/{i}")
        ]
    return []


def _settlement_errors(payload: dict[str, Any]) -> list[str]:
    """hand.completed must move chips without creating or losing any."""
    found = []
    hand, results, bonus = payload["hand"], payload["results"], payload["seven_deuce"]
    if not hand["complete"]:
        found.append("hand: hand.completed carries a hand that is not complete")
    if sum(r["hand_net"] for r in results) != 0:
        found.append("results: hand_net does not add up to 0")
    if sum(r["seven_deuce_net"] for r in results) != 0:
        found.append("results: seven_deuce_net does not add up to 0")
    by_player = {r["player_id"]: r for r in results}
    for player in hand["players"]:
        result = by_player.get(player["player_id"])
        if result is None:
            found.append(f"results: no row for {player['player_id']}, who played the hand")
        elif result["stack"] - result["seven_deuce_net"] != player["stack"]:
            found.append(f"results/{player['player_id']}: stack does not match the hand's end")
    if bonus is None:
        if any(r["seven_deuce_net"] for r in results):
            found.append("results: seven_deuce_net without a seven_deuce award")
        return found
    paid = {p["player_id"]: p["amount"] for p in bonus["payments"]}
    if bonus["total"] != sum(paid.values()):
        found.append("seven_deuce/total: is not the sum of payments")
    if any(amount > bonus["bonus"] for amount in paid.values()):
        found.append("seven_deuce/payments: nobody pays more than the bonus")
    for pid, result in by_player.items():
        expected = bonus["total"] if pid == bonus["player_id"] else -paid.get(pid, 0)
        if result["seven_deuce_net"] != expected:
            found.append(f"results/{pid}: seven_deuce_net does not match seven_deuce")
    winner = next((p for p in hand["players"] if p["player_id"] == bonus["player_id"]), None)
    if winner is None or winner["cards"] != bonus["cards"]:
        found.append("seven_deuce/cards: the winner's 7-2 must be shown in the hand")
    return found


RANKS = "23456789TJQKA"
STRAIGHTS = frozenset({"straight", "straight_flush"})


def _in_reading_order(category: str, cards: list[str]) -> bool:
    """Cards as clients read them (docs/api/ws-protocol.md): bigger groups first, then higher
    ranks; a five-high straight puts its ace last. Written apart from the engine on purpose."""
    ranks = [card[0] for card in cards]
    if category in STRAIGHTS and set(ranks) == set("A2345"):
        return ranks == list("5432A")
    keys = [(-ranks.count(r), -RANKS.index(r)) for r in ranks]
    return keys == sorted(keys)


def _made_hand_errors(entry: dict[str, Any], hole: list[str], board: list[str]) -> list[str]:
    """The named hand is what its five cards make, the best the player has, in reading order.
    Recomputed with PokerKit from the cards alone, not with the engine's code."""
    where = f"showdown/{entry['player_id']}"
    cards = entry["cards"]
    made = StandardHighHand("".join(cards))
    best = StandardHighHand.from_game("".join(hole), "".join(board))
    found = []
    if made.entry.label.name.lower() != entry["category"]:
        found.append(
            f"{where}: the cards make {made.entry.label.name.lower()}, not {entry['category']}"
        )
    if made.entry != best.entry:
        found.append(f"{where}: not the best hand of the player's cards and the board")
    if not _in_reading_order(entry["category"], cards):
        found.append(f"{where}: cards are not in reading order (bigger groups, higher ranks first)")
    return found


def _showdown_errors(payload: dict[str, Any], viewer: str) -> list[str]:
    """A hand name only for cards everyone sees face up after a showdown, and for all of them."""
    found = []
    hand, showdown = payload["hand"], payload["showdown"]
    players = {p["player_id"]: p for p in hand["players"]}
    if showdown and payload["seven_deuce"] is not None:
        found.append("showdown: a 7-2 bluff is won by folds, there is no showdown")
    if showdown and len(hand["board"]) != 5:
        found.append("showdown: a showdown needs the whole board")
    named = [entry["player_id"] for entry in showdown]
    if len(set(named)) != len(named):
        found.append("showdown: a player is named twice")
    for entry in showdown:
        pid = entry["player_id"]
        player = players.get(pid)
        where = f"showdown/{pid}"
        if (
            player is None
            or not player["in_hand"]
            or not player["cards"]
            or HIDDEN in player["cards"]
        ):
            found.append(f"{where}: names a hand whose cards are not shown")
            continue
        if entry["seat"] != player["seat"]:
            found.append(f"{where}: seat does not match the hand")
        if not set(entry["cards"]) <= set(player["cards"]) | set(hand["board"]):
            found.append(f"{where}: cards are not the player's shown cards and the board")
        elif len(hand["board"]) == 5:
            found += _made_hand_errors(entry, player["cards"], hand["board"])
    if payload["seven_deuce"] is None:
        for pid, player in players.items():
            shown = player["cards"] and HIDDEN not in player["cards"]
            if pid != viewer and shown and pid not in named:
                found.append(f"showdown: {pid}'s cards are shown without a hand name")
    return found


def semantic_errors(message: dict[str, Any], viewer: str) -> list[str]:
    """Problems with sending this schema-valid server ``message`` to player ``viewer``."""
    found = _secret_keys(message)
    payload = message["payload"]
    match message["type"]:
        case "table.snapshot":
            table = payload["table"]
            hand = table["hand"]
            if table["you"]["player_id"] != viewer:
                found.append("table/you: the snapshot is for another player")
            seat = next((s["seat"] for s in table["seats"] if s["player_id"] == viewer), None)
            if table["you"]["seat"] != seat:
                found.append("table/you/seat: does not match the receiver's seat")
            if message["hand_id"] != (hand["hand_id"] if hand else None):
                found.append("hand_id: differs from the snapshot's hand")
            if hand is not None:
                found += hand_view_errors(hand, viewer)
        case "hand.started" | "action.applied" | "hand.completed":
            hand = payload["hand"]
            if message["hand_id"] != hand["hand_id"]:
                found.append("hand_id: differs from payload/hand/hand_id")
            found += hand_view_errors(hand, viewer)
            if message["type"] == "action.applied":
                action = payload["action"]
                seats = {p["player_id"]: p["seat"] for p in hand["players"]}
                if seats.get(action["player_id"]) != action["seat"]:
                    found.append("action: the player is not in that seat of this hand")
            if message["type"] == "hand.completed":
                found += _settlement_errors(payload)
                found += _showdown_errors(payload, viewer)
    return found


def validate_outgoing(message: Any, viewer: str) -> None:
    """Schema, then semantics: raise unless ``message`` is safe to send to ``viewer``."""
    validate(message, "server")
    found = semantic_errors(message, viewer)
    if found:
        raise ContractError("server", found)
