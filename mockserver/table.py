"""Game logic of the mock server: one room, driven by a scenario fixture, no sockets.

This is a stand-in for the real table actor (B4, see docs/adr/ADR-001-table-actor.md) so the
frontend can be built against docs/api/ws-protocol.md today. It keeps everything in memory
(``TableSession``, no database) and is not meant to become the actor.

Every method returns the messages to send as ``(connection_id, message)`` pairs; the caller
owns the sockets. Every message goes through ``_send``, which checks it against the JSON Schema
first, so the mock can never send something the contract does not allow.

Players with no open connection are bots: they act ``bot_delay`` seconds into their turn,
following the scenario's ``bot_script`` for the hand when it has a legal move left, otherwise
a simple policy. Connected players get the full clock and are checked or folded when it runs out.
"""

import json
import random
from collections.abc import Callable
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

from apps.games import contract
from apps.games.engine.cards import shuffled_deck
from apps.games.engine.hand import Action, ActionKind, HandEngine, IllegalAction
from apps.games.engine.table import LedgerKind, TableError, TableSession

SCENARIO_PATH = contract.API_DIR / "fixtures" / "scenarios" / "three-friends.json"
PROTOCOL_VERSION = 1
SPECTATOR_ID_BASE = 900

Outbound = tuple[str, dict[str, Any]]


def iso(timestamp: float) -> str:
    moment = datetime.fromtimestamp(timestamp, UTC)
    return moment.strftime("%Y-%m-%dT%H:%M:%S.") + f"{moment.microsecond // 1000:03d}Z"


def load_scenario(path: Path = SCENARIO_PATH) -> dict[str, Any]:
    return json.loads(path.read_text())


class Reject(Exception):
    def __init__(self, code: str, message: str = ""):
        super().__init__(message or code)
        self.code = code


class MockTable:
    def __init__(
        self,
        scenario: dict[str, Any],
        clock: Callable[[], float],
        bot_delay: float = 1.5,
        next_hand_delay: float = 4.0,
        think_time: int | None = None,
    ):
        self.clock = clock
        self.bot_delay = bot_delay
        self.next_hand_delay = next_hand_delay
        self.room = dict(scenario["room"])
        if think_time is not None:
            self.room["think_time_seconds"] = think_time
        self.names = {p["player_id"]: p["display_name"] for p in scenario["players"]}
        self.first_hand_id = scenario["first_hand_id"]
        self.bot_script = scenario.get("bot_script", {})
        self._rng = random.Random(scenario.get("seed"))
        decks = [tuple(deck) for deck in scenario.get("decks", [])]

        def shuffle() -> tuple[str, ...]:
            return decks.pop(0) if decks else shuffled_deck(self._rng)

        self.session = TableSession(
            self.room["small_blind"],
            self.room["big_blind"],
            max_seats=self.room["max_seats"],
            shuffle=shuffle,
            seven_deuce_bonus=self.room["seven_deuce_bonus"],
        )
        for player in scenario["players"]:
            self.session.take_seat(player["player_id"], player["seat"])
            self.session.grant_chips(player["player_id"], player["chips"])

        self.version = 0
        self.connections: dict[str, str] = {}  # connection id -> player id
        self._spectators = 0
        # command_id -> (what was asked, version of the first event it caused)
        self._applied: dict[str, tuple[tuple, int]] = {}
        self._script: dict[str, list[str]] = {}  # bot moves left for the running hand
        self._turn_started = 0.0
        self._deadline: float | None = None
        self._next_hand_at = clock()

    # ---- connections -------------------------------------------------------------------

    def connect(self, conn: str, player_id: str | None) -> list[Outbound]:
        if player_id not in self.names:
            self._spectators += 1
            player_id = str(SPECTATOR_ID_BASE + self._spectators)
        was_connected = self._connected(player_id)
        out: list[Outbound] = []
        self.connections[conn] = player_id
        if player_id in self.session.seats.values() and not was_connected:
            out += self._seat_updated(self._seat_of(player_id), exclude=conn)
        out.append(self._reply(conn, "table.snapshot", {"table": self._table_state(player_id)}))
        return out

    def disconnect(self, conn: str) -> list[Outbound]:
        player_id = self.connections.pop(conn, None)
        if player_id in self.session.seats.values() and not self._connected(player_id):
            return self._seat_updated(self._seat_of(player_id))
        return []

    def player_of(self, conn: str) -> str:
        return self.connections[conn]

    def _connected(self, player_id: str) -> bool:
        return player_id in self.connections.values()

    # ---- incoming messages -------------------------------------------------------------

    def receive(self, conn: str, text: str) -> list[Outbound]:
        try:
            message = json.loads(text)
        except ValueError as error:
            return [self._protocol_error(conn, "invalid_json", str(error))]
        if not isinstance(message, dict):
            return [self._protocol_error(conn, "invalid_json", "A message must be an object.")]
        if message.get("protocol_version") != PROTOCOL_VERSION:
            return [self._protocol_error(conn, "unsupported_protocol_version", "Use version 1.")]
        if message.get("type") not in contract.MESSAGE_TYPES["client"]:
            return [self._protocol_error(conn, "unknown_type", f"Unknown {message.get('type')}.")]

        errors = contract.errors(message, "client")
        command_id = message.get("command_id")
        if errors:
            if contract.matches(command_id, "CommandId"):
                return [self._rejected(conn, command_id, "invalid_command", "; ".join(errors))]
            return [self._protocol_error(conn, "invalid_message", "; ".join(errors))]
        if message["room_id"] != self.room["room_id"]:
            return [self._rejected(conn, command_id, "invalid_command", "Wrong room.")]

        if message["type"] == "resync.request":
            player_id = self.player_of(conn)
            return [self._reply(conn, "table.snapshot", {"table": self._table_state(player_id)})]
        return self._command(conn, message)

    def _command(self, conn: str, message: dict[str, Any]) -> list[Outbound]:
        player_id = self.player_of(conn)
        command_id = message["command_id"]
        asked = (player_id, message["type"], message.get("hand_id"), json.dumps(message["payload"]))
        if command_id in self._applied:
            first_asked, result_version = self._applied[command_id]
            if first_asked != asked:
                return [self._rejected(conn, command_id, "command_id_reused")]
            return [self._ack(conn, command_id, result_version, duplicate=True)]

        handler = {
            "command.act": self._act,
            "command.sit_out": self._sit_out,
            "command.sit_in": self._sit_in,
        }[message["type"]]
        result_version = self.version + 1  # the first state event the command causes
        try:
            out = handler(player_id, message)
        except Reject as reject:
            return [self._rejected(conn, command_id, reject.code, str(reject))]
        self._applied[command_id] = (asked, result_version)
        return out + [self._ack(conn, command_id, result_version)]

    def _act(self, player_id: str, message: dict[str, Any]) -> list[Outbound]:
        hand = self.session.current_hand
        if hand is None:
            raise Reject("no_active_hand")
        if message["hand_id"] != self._hand_id():
            raise Reject("stale_hand", f"Hand {self._hand_id()} is running.")
        if player_id not in self.session.seats.values():
            raise Reject("not_seated")
        payload = message["payload"]
        action = Action(player_id, ActionKind(payload["kind"]), payload["amount"])
        try:
            hand.act(action)
        except IllegalAction as error:
            code = "no_active_hand" if error.code == "hand_complete" else error.code
            raise Reject(code, str(error)) from None
        return self._after_action(action, timeout=False)

    def _sit_out(self, player_id: str, message: dict[str, Any]) -> list[Outbound]:
        if player_id not in self.session.seats.values():
            raise Reject("not_seated")
        if player_id in self.session.sitting_out:
            raise Reject("already_sitting_out")
        self.session.sit_out(player_id)
        return self._seat_updated(self._seat_of(player_id))

    def _sit_in(self, player_id: str, message: dict[str, Any]) -> list[Outbound]:
        if player_id not in self.session.seats.values():
            raise Reject("not_seated")
        if player_id not in self.session.sitting_out:
            raise Reject("not_sitting_out")
        self.session.sit_in(player_id)
        return self._seat_updated(self._seat_of(player_id))

    # ---- time: new hands, bots, clocks -------------------------------------------------

    def tick(self) -> list[Outbound]:
        now = self.clock()
        hand = self.session.current_hand
        if hand is None:
            # Nobody watching yet: wait, so the scripted first hand is not played to an empty room.
            if self.connections and now >= self._next_hand_at:
                return self._start_hand()
            return []
        actor = hand.actor
        if actor is None:
            return []
        if self._deadline is not None and now >= self._deadline:
            return self._after_action(hand.timeout(actor), timeout=True)
        if not self._connected(actor) and now >= self._turn_started + self.bot_delay:
            action = self._bot_action(hand, actor)
            hand.act(action)
            return self._after_action(action, timeout=False)
        return []

    def _start_hand(self) -> list[Outbound]:
        try:
            self.session.start_hand()
        except TableError:
            self._next_hand_at = self.clock() + self.next_hand_delay
            return []
        self._script = {
            player: list(moves)
            for player, moves in self.bot_script.get(str(self.session.hand_no), {}).items()
        }
        out = self._broadcast("hand.started", lambda viewer: {"hand": self._hand_view(viewer)})
        return out + self._turn()

    def _bot_action(self, hand: HandEngine, player_id: str) -> Action:
        legal = hand.legal_actions(player_id)
        script = self._script.get(player_id, [])
        while script:
            kind = ActionKind(script.pop(0))
            if (
                (kind == ActionKind.FOLD and legal.can_fold)
                or (kind == ActionKind.CHECK and legal.can_check)
                or (kind == ActionKind.CALL and not legal.can_check)
            ):
                return Action(player_id, kind)
        if legal.can_check:
            if legal.min_raise_to is not None and self._rng.random() < 0.15:
                return Action(player_id, ActionKind.RAISE, legal.min_raise_to)
            return Action(player_id, ActionKind.CHECK)
        if legal.call_amount <= 4 * self.room["big_blind"] or self._rng.random() < 0.3:
            return Action(player_id, ActionKind.CALL)
        return Action(player_id, ActionKind.FOLD)

    def _after_action(self, action: Action, timeout: bool) -> list[Outbound]:
        applied = {
            "player_id": action.player_id,
            "seat": self._seat_of(action.player_id),
            "kind": str(action.kind),
            "amount": action.amount,
            "timeout": timeout,
        }
        out = self._broadcast(
            "action.applied",
            lambda viewer: {"action": applied, "hand": self._hand_view(viewer)},
        )
        if self.session.current_hand.is_complete:
            return out + self._complete_hand()
        return out + self._turn()

    def _turn(self) -> list[Outbound]:
        self._turn_started = self.clock()
        self._deadline = self._turn_started + self.room["think_time_seconds"]
        turn = self._turn_info()
        return self._broadcast("turn.deadline", lambda viewer: {"turn": turn})

    def _complete_hand(self) -> list[Outbound]:
        hand = self.session.current_hand
        hand_no = self.session.hand_no
        views = {viewer: self._hand_view(viewer) for viewer in set(self.connections.values())}
        hand_id = self._hand_id()
        self.session.finish_hand()
        self._deadline = None
        self._next_hand_at = self.clock() + self.next_hand_delay

        hand_net = hand.result().net
        bonus_net: dict[str, int] = {}
        for entry in self.session.ledger:
            if entry.hand_no == hand_no and entry.kind == LedgerKind.SEVEN_DEUCE:
                bonus_net[entry.player_id] = bonus_net.get(entry.player_id, 0) + entry.amount
        stacks = self.session.stacks
        players = sorted(set(hand_net) | set(bonus_net), key=self._seat_of)
        results = [
            {
                "player_id": p,
                "seat": self._seat_of(p),
                "hand_net": hand_net.get(p, 0),
                "seven_deuce_net": bonus_net.get(p, 0),
                "stack": stacks.get(p, 0),
            }
            for p in players
        ]
        seven_deuce = None
        winner = hand.seven_deuce_bluff_winner()
        if hand.config.seven_deuce_bonus > 0 and winner is not None:
            public = {p["player_id"]: p["cards"] for p in hand.view_for(None)["players"]}
            payments = [
                {"player_id": p, "seat": self._seat_of(p), "amount": -bonus_net[p]}
                for p in players
                if bonus_net.get(p, 0) < 0
            ]
            seven_deuce = {
                "player_id": winner,
                "seat": self._seat_of(winner),
                "cards": public[winner],
                "bonus": hand.config.seven_deuce_bonus,
                "payments": payments,
                "total": sum(p["amount"] for p in payments),
            }
        return self._broadcast(
            "hand.completed",
            lambda viewer: {"hand": views[viewer], "results": results, "seven_deuce": seven_deuce},
            hand_id=hand_id,
        )

    # ---- state for clients -------------------------------------------------------------

    def _hand_id(self) -> int | None:
        if self.session.current_hand is None:
            return None
        return self.first_hand_id + self.session.hand_no - 1

    def _seat_of(self, player_id: str) -> int:
        for seat, player in self.session.seats.items():
            if player == player_id:
                return seat
        raise KeyError(player_id)

    def _hand_view(self, viewer: str) -> dict[str, Any] | None:
        hand = self.session.current_hand
        if hand is None:
            return None
        seated = viewer if viewer in hand.player_order else None
        return {
            "hand_id": self._hand_id(),
            "hand_no": self.session.hand_no,
            **hand.view_for(seated),
        }

    def _room_info(self) -> dict[str, Any]:
        status = "playing" if self.session.current_hand is not None else "open"
        return {**self.room, "status": status}

    def _occupant(self, seat: int) -> dict[str, Any] | None:
        player_id = self.session.seats.get(seat)
        if player_id is None:
            return None
        return {
            "seat": seat,
            "player_id": player_id,
            "display_name": self.names[player_id],
            "stack": self.session.stacks.get(player_id, 0),
            "sitting_out": player_id in self.session.sitting_out,
            "connected": self._connected(player_id),
        }

    def _turn_info(self) -> dict[str, Any] | None:
        hand = self.session.current_hand
        if hand is None or hand.actor is None or self._deadline is None:
            return None
        return {
            "player_id": hand.actor,
            "seat": self._seat_of(hand.actor),
            "deadline": iso(self._deadline),
            "think_time_seconds": self.room["think_time_seconds"],
        }

    def _table_state(self, viewer: str) -> dict[str, Any]:
        seat = self._seat_of(viewer) if viewer in self.session.seats.values() else None
        return {
            "room": self._room_info(),
            "you": {"player_id": viewer, "seat": seat},
            "seats": [self._occupant(s) for s in sorted(self.session.seats)],
            "hand": self._hand_view(viewer),
            "turn": self._turn_info(),
        }

    # ---- sending -----------------------------------------------------------------------

    def _seat_updated(self, seat: int, exclude: str | None = None) -> list[Outbound]:
        occupant = self._occupant(seat)
        return self._broadcast(
            "seat.updated", lambda viewer: {"seat": seat, "occupant": occupant}, exclude=exclude
        )

    def _broadcast(
        self,
        type_: str,
        payload_for: Callable[[str], dict[str, Any]],
        hand_id: int | None = None,
        exclude: str | None = None,
    ) -> list[Outbound]:
        """A state event: the room version goes up by one, each viewer gets their projection."""
        self.version += 1
        hand_id = hand_id if hand_id is not None else self._hand_id()
        return [
            self._send(conn, type_, payload_for(viewer), hand_id)
            for conn, viewer in self.connections.items()
            if conn != exclude
        ]

    def _reply(self, conn: str, type_: str, payload: dict[str, Any]) -> Outbound:
        return self._send(conn, type_, payload, self._hand_id())

    def _ack(self, conn: str, command_id: str, result_version: int, duplicate=False) -> Outbound:
        payload = {"command_id": command_id, "duplicate": duplicate}
        return self._reply(conn, "command.ack", {**payload, "result_version": result_version})

    def _rejected(self, conn: str, command_id: str, code: str, message: str = "") -> Outbound:
        payload = {"command_id": command_id, "code": code, "message": message or code}
        return self._reply(conn, "command.rejected", payload)

    def _protocol_error(self, conn: str, code: str, message: str) -> Outbound:
        return self._reply(conn, "protocol.error", {"code": code, "message": message})

    def _send(
        self, conn: str, type_: str, payload: dict[str, Any], hand_id: int | None
    ) -> Outbound:
        message = {
            "protocol_version": PROTOCOL_VERSION,
            "type": type_,
            "room_id": self.room["room_id"],
            "hand_id": hand_id,
            "version": self.version,
            "server_time": iso(self.clock()),
            "payload": payload,
        }
        contract.validate(message, "server")
        return conn, message
