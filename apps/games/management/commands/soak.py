"""Soak test: guest bots play many hands against a running server over real WebSockets.

Roadmap D ("chơi thử nội bộ nhiều giờ"). Start the server first, on the same database this
command uses, then for example::

    uv run python manage.py soak --url ws://localhost:8000 --players 6 --hands 200

Each bot plays random legal moves and checks what it receives: every message passes the
contract for that bot (no one else's hole cards, no deck), state events arrive in ``version``
order, every command is answered, all bots see the same results for a hand, and the room is
never suspended. ``--reconnect`` and ``--slow`` make bots drop their socket or let the clock run
out now and then. At the end it checks the database: the ledger adds up to the chips granted,
each balance matches the last results the bots saw, and every hand replays to its stored
result. Exits with an error if anything was wrong. Development only.
"""

import asyncio
import json
import random
import uuid
from collections import Counter
from dataclasses import asdict, dataclass, field
from typing import Any
from urllib.parse import urlsplit

from django.core.management.base import BaseCommand, CommandError
from django.db.models import Sum
from django.utils import timezone
from websockets.asyncio.client import ClientConnection, connect
from websockets.exceptions import ConnectionClosed, InvalidHandshake

from apps.games import contract
from apps.games.engine.hand import HandEngine
from apps.games.management.commands._options import add_bomb_pot_arguments, bomb_pot_amount
from apps.games.management.commands.create_demo_room import seat_guest_players
from apps.games.models import (
    MAX_HAND_PAUSE,
    MAX_SEATS,
    MIN_HAND_PAUSE,
    Hand,
    LedgerEntry,
    LedgerKind,
    Room,
)

# docs/api/ws-protocol.md section 4: these move ``version`` by exactly one.
STATE_EVENTS = {
    "hand.started",
    "action.applied",
    "turn.deadline",
    "hand.completed",
    "seat.updated",
    "room.suspended",
    "room.updated",
}
# A bot that let its clock run out, or reconnected mid-turn, races the server's timeout, so the
# server may already have moved on when its command arrives.
RACE_CODES = {"not_your_turn", "stale_hand", "no_active_hand"}
ACK_TIMEOUT = 15.0
MAX_PROBLEMS = 50


@dataclass
class Report:
    target: float  # stop once this many hands have completed
    problems: list[str] = field(default_factory=list)
    results: dict[int, dict[str, Any]] = field(default_factory=dict)  # hand_id -> player -> rows
    last_stacks: dict[str, int] = field(default_factory=dict)
    commands: int = 0
    rejected: Counter = field(default_factory=Counter)
    timeouts: int = 0
    reconnects: int = 0
    gaps: int = 0
    resends: int = 0
    seven_deuce: int = 0
    done: asyncio.Event = field(default_factory=asyncio.Event)

    def problem(self, text: str) -> None:
        if len(self.problems) < MAX_PROBLEMS:
            self.problems.append(text)

    @property
    def completed(self) -> int:
        return len(self.results)


class Bot:
    def __init__(self, player_id: str, session_key: str, options: dict, report: Report):
        self.player_id = player_id
        self.session_key = session_key
        self.options = options
        self.report = report
        self.rng = random.Random(f"{options['seed']}-{player_id}")
        self.ws: ClientConnection | None = None
        self.dropping = False
        # A command stays pending across a reconnect and is sent again with the same
        # command_id (protocol section 5), so the server's duplicate handling gets exercised.
        self.pending: dict[str, Any] | None = None
        self.pending_since = 0.0
        self.may_race = False
        self.reset()

    def reset(self) -> None:
        self.version: int | None = None  # None until the first snapshot of this connection
        self.hand: dict[str, Any] | None = None
        self.turn_version: int | None = None  # version of the message that gave us this turn

    async def run(self) -> None:
        url = self.options["url"].rstrip("/") + f"/ws/rooms/{self.options['room_id']}/"
        parts = urlsplit(url)
        origin = f"{'https' if parts.scheme == 'wss' else 'http'}://{parts.netloc}"
        while not self.report.done.is_set():
            self.reset()
            self.dropping = False
            try:
                async with connect(
                    url,
                    origin=origin,
                    additional_headers={"Cookie": f"sessionid={self.session_key}"},
                    open_timeout=10,
                ) as ws:
                    self.ws = ws
                    async for raw in ws:
                        if self.dropping or self.report.done.is_set():
                            break
                        await self.receive(json.loads(raw))
                    code = ws.close_code
            except (OSError, InvalidHandshake) as error:
                self.report.problem(f"player {self.player_id}: cannot connect: {error}")
                self.report.done.set()
                return
            except ConnectionClosed as error:
                code = error.rcvd.code if error.rcvd else None
            if self.dropping:
                self.may_race = True
                await asyncio.sleep(self.rng.uniform(0.5, 2.0))
            elif not self.report.done.is_set():
                self.report.problem(f"player {self.player_id}: server closed socket ({code})")
                await asyncio.sleep(1.0)

    async def close(self) -> None:
        if self.ws is not None:
            await self.ws.close()

    async def receive(self, message: dict[str, Any]) -> None:
        kind = message.get("type")
        errors = contract.errors(message, "server") or contract.semantic_errors(
            message, self.player_id
        )
        for error in errors:
            self.report.problem(f"player {self.player_id}: {kind} breaks contract: {error}")

        payload = message.get("payload", {})
        if kind == "table.snapshot":
            self.version = message["version"]
            self.hand = payload["table"]["hand"]
            self.turn_version = self.version
            if self.pending:
                self.report.resends += 1
                self.pending_since = asyncio.get_running_loop().time()
                await self.send(self.pending)
        elif kind in STATE_EVENTS:
            if self.version is None:
                return  # waiting for the snapshot a resync asked for
            if message["version"] <= self.version:
                return
            if message["version"] != self.version + 1:
                # The server closes a socket that falls behind rather than skip an event, so
                # a gap on a live connection is a server bug. Resync anyway, like the web app.
                self.report.gaps += 1
                self.report.problem(
                    f"player {self.player_id}: version {message['version']} after {self.version}"
                )
                resync = {"type": "resync.request", "payload": {"last_version": self.version}}
                await self.send(resync)
                self.version = None
                return
            self.version = message["version"]
            await self.on_event(kind, payload)
        elif kind == "command.ack":
            if self.pending and payload["command_id"] == self.pending["command_id"]:
                self.pending = None
                self.may_race = False
        elif kind == "command.rejected":
            if self.pending and payload["command_id"] == self.pending["command_id"]:
                self.pending = None
            code = payload["code"]
            if code in RACE_CODES and self.may_race:
                self.report.rejected[f"{code} (race)"] += 1
            else:
                self.report.rejected[code] += 1
                self.report.problem(f"player {self.player_id}: command rejected: {code}")
        elif kind == "protocol.error":
            self.report.problem(f"player {self.player_id}: protocol.error {payload['code']}")

        await self.maybe_act()
        if self.options["reconnect"] and self.rng.random() < self.options["reconnect"]:
            self.report.reconnects += 1
            self.dropping = True

    async def on_event(self, kind: str, payload: dict[str, Any]) -> None:
        if "hand" in payload:
            self.hand = payload["hand"]
            self.turn_version = self.version
        if kind == "action.applied":
            action = payload["action"]
            if action["timeout"] and action["player_id"] == self.player_id:
                self.report.timeouts += 1
        elif kind == "hand.completed":
            self.on_completed(payload)
        elif kind == "room.suspended":
            self.report.problem(f"room suspended: {payload}")
            self.report.done.set()

    def on_completed(self, payload: dict[str, Any]) -> None:
        hand_id = payload["hand"]["hand_id"]
        report = self.report
        first = hand_id not in report.results
        seen = report.results.setdefault(hand_id, {})
        rows = sorted(payload["results"], key=lambda row: row["player_id"])
        if seen and rows != next(iter(seen.values())):
            report.problem(f"hand {hand_id}: player {self.player_id} saw different results")
        seen[self.player_id] = rows
        if first:
            for row in rows:
                report.last_stacks[row["player_id"]] = row["stack"]
            if payload["seven_deuce"]:
                report.seven_deuce += 1
            if report.completed >= report.target:
                # Stop inside the pause before the next deal: with no one connected the server
                # deals nothing more, so the database stays as the bots last saw it.
                report.done.set()

    async def maybe_act(self) -> None:
        hand = self.hand
        if self.pending or self.dropping or self.report.done.is_set() or self.version is None:
            return
        if not hand or hand["complete"] or hand["actor"] != self.player_id:
            return
        legal = hand["legal_actions"]
        if legal is None or self.turn_version is None:
            return
        self.turn_version = None  # one decision per turn
        if self.rng.random() < self.options["slow"]:
            self.may_race = True  # let the clock run out; the server acts for us
            return
        me = next(p for p in hand["players"] if p["player_id"] == self.player_id)
        kind, amount = self.choose(legal, me["stack"])
        self.pending = {
            "type": "command.act",
            "hand_id": hand["hand_id"],
            "command_id": str(uuid.uuid4()),
            "payload": {"kind": kind, "amount": amount},
        }
        self.pending_since = asyncio.get_running_loop().time()
        self.report.commands += 1
        await asyncio.sleep(self.rng.uniform(0.02, 0.3))
        await self.send(self.pending)

    def choose(self, legal: dict[str, Any], stack: int) -> tuple[str, int | None]:
        # Loose but not suicidal, so a few hundred hands go by before most stacks are gone.
        roll = self.rng.random()
        low, high = legal["min_raise_to"], legal["max_raise_to"]
        can_raise = low is not None and high is not None
        if can_raise and (roll < 0.15 if legal["can_check"] else roll > 0.9):
            if self.rng.random() < 0.02:
                return "raise", high  # all-in
            return "raise", min(high, self.rng.randint(low, low * 3))
        if legal["can_check"]:
            return "check", None
        expensive = legal["call_amount"] * 4 > stack
        if legal["can_fold"] and roll < (0.7 if expensive else 0.25):
            return "fold", None
        return "call", None

    async def send(self, message: dict[str, Any]) -> None:
        message = {"protocol_version": 1, "room_id": self.options["room_id"], **message}
        try:
            await self.ws.send(json.dumps(message))
        except ConnectionClosed:
            self.may_race = True  # a pending command goes again after the reconnect


class Command(BaseCommand):
    help = "Bots play many hands against a running server and check nothing goes wrong."

    def add_arguments(self, parser):
        parser.add_argument("--url", default="ws://localhost:8000")
        parser.add_argument("--players", type=int, default=6)
        parser.add_argument("--hands", type=int, default=100)
        parser.add_argument("--minutes", type=float, default=0, help="stop after this long")
        parser.add_argument("--chips", type=int, default=5000)
        parser.add_argument("--small-blind", type=int, default=5)
        parser.add_argument("--big-blind", type=int, default=10)
        parser.add_argument("--think-time", type=int, default=5)
        parser.add_argument("--seven-deuce-bonus", type=int, default=50)
        parser.add_argument("--ante", type=int, default=0)
        add_bomb_pot_arguments(parser)
        parser.add_argument("--hand-pause", type=int, default=MIN_HAND_PAUSE, help="seconds")
        parser.add_argument("--run-it-twice", action="store_true")
        parser.add_argument("--reconnect", type=float, default=0.01, help="chance per message")
        parser.add_argument("--slow", type=float, default=0.03, help="chance to time out a turn")
        parser.add_argument("--seed", default="soak")

    def handle(self, *args, **options):
        if not 2 <= options["players"] <= MAX_SEATS:
            raise CommandError(f"--players must be between 2 and {MAX_SEATS}.")
        if not MIN_HAND_PAUSE <= options["hand_pause"] <= MAX_HAND_PAUSE:
            # What a room may have (Room.hand_pause_seconds); the database would refuse it.
            raise CommandError(
                f"--hand-pause must be between {MIN_HAND_PAUSE} and {MAX_HAND_PAUSE} seconds."
            )
        room = Room.objects.create(
            name=f"Soak {timezone.now():%Y-%m-%d %H:%M:%S}",
            small_blind=options["small_blind"],
            big_blind=options["big_blind"],
            think_time_seconds=options["think_time"],
            seven_deuce_bonus=options["seven_deuce_bonus"],
            ante=options["ante"],
            bomb_pot_every=options["bomb_pot_every"],
            bomb_pot_amount=bomb_pot_amount(options, options["big_blind"]),
            hand_pause_seconds=options["hand_pause"],
            running=True,  # as if the owner had pressed Start: dealt after the countdown
            run_it_twice=options["run_it_twice"],
        )
        seated = seat_guest_players(room, options["players"], options["chips"])
        options["room_id"] = room.pk
        self.stdout.write(f"Room {room.pk}: {len(seated)} bots, {options['url']}")

        report = asyncio.run(self.play(seated, options))
        notes = self.check_database(room, report)
        self.summary(report, notes)
        if report.problems:
            raise CommandError(f"{len(report.problems)} problem(s), see above.")

    async def play(self, seated, options) -> Report:
        report = Report(target=options["hands"] or float("inf"))
        bots = [Bot(str(user.pk), key, options, report) for user, key in seated]
        tasks = [asyncio.create_task(bot.run()) for bot in bots]
        loop = asyncio.get_running_loop()
        started = progress_at = loop.time()
        progress = 0
        stall = 30 + options["think_time"] * options["players"] * 4
        while not report.done.is_set():
            await asyncio.sleep(1)
            now = loop.time()
            if options["minutes"] and now - started > options["minutes"] * 60:
                report.target = min(report.target, report.completed + 1)
            if report.completed != progress:
                progress, progress_at = report.completed, now
                if progress % 10 == 0:
                    self.stdout.write(f"  {progress} hands, {now - started:.0f}s")
            elif now - progress_at > stall:
                if sum(1 for stack in report.last_stacks.values() if stack > 0) < 2:
                    self.stdout.write("Stopped early: fewer than two players have chips left.")
                else:
                    report.problem(f"no hand finished in {stall}s")
                report.done.set()
            for bot in bots:
                if bot.pending and now - bot.pending_since > ACK_TIMEOUT:
                    report.problem(f"player {bot.player_id}: no answer to a command")
                    bot.pending = None
        await asyncio.gather(*(bot.close() for bot in bots))
        for outcome in await asyncio.gather(*tasks, return_exceptions=True):
            if isinstance(outcome, Exception):
                report.problem(f"bot crashed: {outcome!r}")
        return report

    def check_database(self, room: Room, report: Report) -> list[str]:
        entries = LedgerEntry.objects.filter(room=room)
        granted = entries.filter(kind=LedgerKind.GRANT).aggregate(s=Sum("amount"))["s"] or 0
        total = entries.aggregate(s=Sum("amount"))["s"] or 0
        if total != granted:
            report.problem(f"ledger: {total} chips in the room, {granted} granted")
        balances = {
            str(row["user_id"]): row["s"]
            for row in entries.values("user_id").annotate(s=Sum("amount"))
        }
        for player_id, stack in report.last_stacks.items():
            if balances.get(player_id) != stack:
                report.problem(
                    f"ledger: player {player_id} has {balances.get(player_id)}, bots saw {stack}"
                )

        hands = Hand.objects.filter(room=room).prefetch_related("commands")
        notes = []
        replayed = 0
        for hand in hands:
            if hand.completed_at is None:
                notes.append(f"hand {hand.pk} still running when the bots left")
                continue
            if hand.result.get("voided"):
                continue
            engine = HandEngine.replay(hand.replay_record())
            if json.loads(json.dumps(asdict(engine.result()))) != hand.result:
                report.problem(f"hand {hand.pk}: replay gives a different result")
            replayed += 1
        if replayed != report.completed:
            report.problem(f"{replayed} hands in the database, bots saw {report.completed}")
        return notes

    def summary(self, report: Report, notes: list[str]) -> None:
        self.stdout.write(
            f"Hands: {report.completed} (7-2 bonus in {report.seven_deuce}). "
            f"Commands: {report.commands}, timeouts: {report.timeouts}, "
            f"reconnects: {report.reconnects}, resent: {report.resends}, "
            f"version gaps: {report.gaps}."
        )
        if report.rejected:
            self.stdout.write(f"Rejected: {dict(report.rejected)}")
        for note in notes:
            self.stdout.write(note)
        for problem in report.problems:
            self.stderr.write(self.style.ERROR(problem))
        if not report.problems:
            self.stdout.write(self.style.SUCCESS("No problems found."))
