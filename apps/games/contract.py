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
        "command.ack",
        "command.rejected",
        "protocol.error",
    ],
    "client": ["command.act", "command.sit_out", "command.sit_in", "resync.request"],
}

# Server messages that change the room and add 1 to its version; every other server message
# is a reply to one connection and carries the current version unchanged.
STATE_EVENTS = frozenset(
    {"hand.started", "action.applied", "turn.deadline", "hand.completed", "seat.updated"}
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
