"""The real table actor (ADR-001): one asyncio task + queue per room, the only writer of its
``TableSession``/``HandEngine``. This ports ``mockserver.table.MockTable``'s message handling
to real persistence (``HandCommand``, ``services.save_completed_hand``) and Django Channels,
instead of an in-memory list of sockets.

Order per command, per ADR-001 mục 2: check (``HandEngine.check``) -> write ``HandCommand`` ->
apply (``HandEngine.act``) -> broadcast. A room's actor lives in ``_actors`` for the lifetime of
the ASGI process; recovery (ADR-001 mục 4) rebuilds it from the database when first needed.
"""

import asyncio
import json
import logging
from collections.abc import Awaitable, Callable
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from typing import Any

from channels.db import database_sync_to_async
from channels.exceptions import ChannelFull
from channels.layers import get_channel_layer
from django.conf import settings
from django.db import IntegrityError, transaction
from django.db.models import Exists, OuterRef
from django.utils import timezone

from . import contract
from .engine.cards import shuffled_deck
from .engine.hand import Action, ActionKind, HandEngine, IllegalAction
from .engine.table import LedgerEntry as EngineLedgerEntry
from .engine.table import LedgerKind as EngineLedgerKind
from .engine.table import TableError, TableSession
from .models import (
    ChatMessage,
    Hand,
    HandCommand,
    LedgerEntry,
    LedgerKind,
    OwnerAction,
    Room,
    RoomBan,
    RoomMember,
    RoomSeat,
    User,
)
from .services import save_completed_hand

# save_completed_hand() is synchronous (one transaction.atomic block); run it in a thread.
asave_completed_hand = database_sync_to_async(save_completed_hand)

log = logging.getLogger("games.actor")
PROTOCOL_VERSION = 1


def iso(moment: datetime | None = None) -> str:
    moment = moment or datetime.now(UTC)
    return moment.strftime("%Y-%m-%dT%H:%M:%S.") + f"{moment.microsecond // 1000:03d}Z"


# After a restart mid-hand the player to act keeps what was left of their clock, but never less
# than this (capped at the room's think time): the outage was not their fault (ADR-001 mục 4.5).
RECOVERY_GRACE_SECONDS = 10


class Reject(Exception):
    def __init__(self, code: str, message: str = "", field: str | None = None):
        super().__init__(message or code)
        self.code = code
        self.field = field  # the setting a validation_error is about


class RoomSuspended(Exception):
    """Raised internally to stop processing after a hand-breaking error (ADR-001 mục 5)."""


# ---- queue items: everything that can change a room goes through the one queue ------------


@dataclass
class _Connect:
    conn: str
    channel: str
    player_id: str
    name: str = ""


@dataclass
class _Chat:
    player_id: str
    text: str


@dataclass
class _Disconnect:
    conn: str


@dataclass
class _Command:
    conn: str
    player_id: str
    message: dict[str, Any]


@dataclass
class _Timeout:
    hand_pk: int  # ignored if the room has moved past this hand
    player_id: str  # ignored if it is no longer this player's turn (ADR-001 mục "Hết giờ")
    # Actions applied in the hand when the clock was set: the clock only acts on that turn,
    # not on a later turn of the same player (heads-up: the big blind closes preflop by
    # checking and is first to act on the flop).
    turn: int


# The clock's own commands are named "timeout:<hand>-<n>"; ":" is outside the CommandId
# pattern clients must use (docs/api/schema/common.schema.json), so no client can take it.
TIMEOUT_COMMAND_PREFIX = "timeout:"
# The clock's command could not be recorded (nothing applied yet): try again this much later.
TIMEOUT_RETRY_SECONDS = 1.0


@dataclass
class _StartHand:
    epoch: int  # the schedule it was set for; an older one (cancelled, replaced) is ignored


@dataclass
class _IdleClose:
    epoch: int  # the empty spell it was set for; a later one (someone sat down) is ignored


@dataclass
class _AwayStand:
    player_id: str
    token: int  # the absence it was set for; a later one (they came back) is ignored


@dataclass
class _TakeSeat:
    user: User
    seat: int
    future: asyncio.Future


@dataclass
class _LeaveSeat:
    user: User
    future: asyncio.Future


@dataclass
class _Call:
    """An owner action (B7), run by the room's one writer like everything else."""

    fn: Callable[[], Awaitable[Any]]
    future: asyncio.Future


# Settings the owner may change (PATCH /api/rooms/{id}/); they apply between hands, except
# IMMEDIATE_SETTINGS.
ROOM_SETTINGS = (
    "name",
    "max_seats",
    "is_private",
    "small_blind",
    "big_blind",
    "think_time_seconds",
    "seven_deuce_bonus",
    "starting_stack",
    "ante",
    "bomb_pot_every",
    "bomb_pot_amount",
    "run_it_twice",
    "rabbit_hunt",
    "hand_pause_seconds",
)
# Applied at once, even during a hand: the hand being played does not use them (a seat above a
# lower max_seats just cannot be taken; who may open a private room is checked on each request).
IMMEDIATE_SETTINGS = ("max_seats", "is_private")
KICKED_CLOSE_CODE = 4403
# After Start (or when a running room gets its second player), the table counts this long down
# before the deal, so everyone sees it coming.
START_COUNTDOWN_SECONDS = 10
BOMB_POT_NEEDS_AMOUNT = "bomb_pot_amount must be above 0 while bomb_pot_every is on"
# A client that stopped reading (its channel is full) is dropped, then its socket is closed with
# this code once the channel has room: the client reconnects and gets a fresh snapshot.
RESYNC_CLOSE_CODE = 4408
CLOSE_RETRY_SECONDS = 1.0
CLOSE_ATTEMPTS = 30
# What clients see when a room stops (fail-stop). The cause goes to the server log only: an
# engine error can quote the deck or someone's hole cards.
SUSPENDED_MESSAGE = "The table stopped after a server error and waits for recovery."
# A room with nobody seated (spectators do not count) closes itself after this long, as if the
# owner had closed it (history, replays and the ledger stay). Someone sitting down before then
# starts it over. Room.empty_since keeps the start of the spell across restarts.
ROOM_IDLE_CLOSE_SECONDS = 5 * 60
# How often the process looks for rooms past that time (sweep_idle_rooms): a room's own actor
# closes it on time; this catches rooms whose actor is not loaded (made and never opened,
# untouched since a restart).
IDLE_SWEEP_SECONDS = 30.0
# The sweep waits this long for a loaded room's actor to answer, then goes on to the next room.
IDLE_SWEEP_ACTOR_TIMEOUT = 10.0
# A seated player with no connection to the table this long stands up, as if they had left the
# seat themselves (in a hand: when it ends). Their chips stay theirs in the room. Without it a
# room everyone walked away from would keep its seats taken and never close itself.
ROOM_AWAY_STAND_SECONDS = 5 * 60


class TableActor:
    # Tests set these: the countdown before the first hand (START_COUNTDOWN_SECONDS), and the
    # pause between two hands (the room's hand_pause_seconds). None = the real ones.
    start_countdown: float | None = None
    next_hand_delay: float | None = None
    # Tests set this too: how long a room stays open with nobody seated (ROOM_IDLE_CLOSE_SECONDS).
    idle_close: float | None = None
    # And this: how long a seated player may be gone before they stand up (ROOM_AWAY_STAND_SECONDS).
    away_stand: float | None = None

    def __init__(self, room: Room, session: TableSession, hand: Hand | None):
        self.room = room
        self.session = session
        self.hand = hand  # the DB row for session.current_hand, or None between hands
        self.version = 0
        self.suspended = False
        self.connections: dict[str, str] = {}  # conn id -> player id (str(user.pk))
        self.channels: dict[str, str] = {}  # conn id -> Channels channel name
        self.names: dict[str, str] = {}  # player id -> display name, filled as seen
        self._queue: asyncio.Queue = asyncio.Queue()
        self._applied: dict[tuple, tuple] = {}  # see _dedup_key
        self._deadline_timer = None
        self._deadline: datetime | None = None
        self.resume_deadline: datetime | None = None  # set by _recover() for a hand in progress
        self.pending: dict[str, Any] = {}  # owner's setting changes waiting for the next hand
        self.closing = False  # the owner closed the room during a hand
        self._audience: list[dict[str, str]] = []  # last spectator list sent (B8)
        # When the next hand will be dealt (the start countdown or the pause after a hand), or
        # None. Every new schedule or cancel moves the epoch on, so an old timer does nothing.
        self._next_hand_at: datetime | None = None
        self._deal_epoch = 0
        self._deal_timer: asyncio.TimerHandle | None = None
        # The idle close (room.empty_since + idle_close_seconds()), same epoch rule as the deal.
        self._idle_epoch = 0
        self._idle_timer: asyncio.TimerHandle | None = None
        # Seated players with no connection: their stand-up timer (token, handle). The token
        # moves on with every new timer, so an old one that fires anyway does nothing.
        self._away: dict[str, tuple[int, asyncio.TimerHandle]] = {}
        self._away_token = 0
        self._away_leaving: set[str] = set()  # leaving because they were gone, not by asking
        self._closers: set[asyncio.Task] = set()  # see _drop_full
        # The last finished hand, whose players may show their cards until the next hand
        # starts (command.show_cards), and what was shown. In memory only: lost on a restart.
        self._last_hand: tuple[int, HandEngine] | None = None
        self._shown: list[dict[str, Any]] = []
        self._task = asyncio.create_task(self._run())
        self._task.add_done_callback(self._task_ended)

    # ---- public: called from consumers/views, never touches the engine directly -----------

    def connect(self, conn: str, channel: str, player_id: str, name: str = "") -> None:
        self._queue.put_nowait(_Connect(conn, channel, player_id, name))

    def chat(self, player_id: str, text: str) -> None:
        self._queue.put_nowait(_Chat(player_id, text))

    def disconnect(self, conn: str) -> None:
        self._queue.put_nowait(_Disconnect(conn))

    def submit_command(self, conn: str, player_id: str, message: dict[str, Any]) -> None:
        self._queue.put_nowait(_Command(conn, player_id, message))

    async def take_seat(self, user: User, seat: int) -> dict[str, Any]:
        future: asyncio.Future = asyncio.get_running_loop().create_future()
        self._queue.put_nowait(_TakeSeat(user, seat, future))
        return await future

    async def leave_seat(self, user: User) -> bool:
        """Stand up; ``False`` when they are in the running hand and go only once it ends."""
        future: asyncio.Future = asyncio.get_running_loop().create_future()
        self._queue.put_nowait(_LeaveSeat(user, future))
        return await future

    async def stay(self, user: User) -> dict[str, Any]:
        """Take back a leave asked during the hand; returns the occupant."""
        return await self._call(lambda: self._stay(str(user.pk)))

    async def grant_chips(self, player_id: str, amount: int) -> int:
        return await self._call(lambda: self._grant_chips(player_id, amount))

    async def rebuy(self, player_id: str) -> int:
        """A busted seated player takes the room's starting stack again; returns the new stack."""
        return await self._call(lambda: self._rebuy(player_id))

    async def update_settings(self, changes: dict[str, Any]) -> None:
        await self._call(lambda: self._update_settings(changes))

    async def kick(self, user_id: int) -> None:
        await self._call(lambda: self._kick(user_id))

    async def drop_player(self, user_id: int, code: int) -> None:
        """Close this player's sockets here, at once (staff switched the account off)."""
        await self._call(lambda: self._drop_player(user_id, code))

    async def close(self) -> bool:
        """Close the room; ``False`` when it closes only after the running hand."""
        return await self._call(self._close)

    async def close_if_idle(self) -> bool:
        """Close the room if nobody has been seated for idle_close_seconds(); whether it did."""
        return await self._call(self._close_if_idle)

    async def start(self) -> tuple[bool, dict[str, Any]]:
        """The owner's Start: hands are dealt from now on. Returns whether the room was paused
        until now (False: nothing changed) and the room info."""
        return await self._call(self._start)

    async def pause(self) -> tuple[bool, dict[str, Any]]:
        """The owner's Pause: no new hand (a running one is played out). Returns whether the
        room was running until now (False: nothing changed) and the room info."""
        return await self._call(self._pause)

    async def _call(self, fn: Callable[[], Awaitable[Any]]) -> Any:
        future: asyncio.Future = asyncio.get_running_loop().create_future()
        self._queue.put_nowait(_Call(fn, future))
        return await future

    @property
    def closed(self) -> bool:
        return self.room.status == Room.Status.CLOSED

    def snapshot_message(self, player_id: str) -> dict[str, Any]:
        """A full ``table.snapshot`` envelope for ``player_id``, built directly (no queue).

        Used for ``resync.request`` and the REST snapshot endpoint, which are read-only and do
        not need the single-writer ordering a command needs. It can occasionally be read a
        moment before an in-flight command's broadcast finishes (a small, harmless staleness
        window); it can never see a half-applied command, since nothing here awaits mid-mutation.
        """
        message = {
            "protocol_version": PROTOCOL_VERSION,
            "type": "table.snapshot",
            "room_id": self.room.pk,
            "hand_id": self.hand.pk if self.hand else None,
            "version": self.version,
            "server_time": iso(),
            "payload": {"table": self._table_state(player_id)},
        }
        contract.validate_outgoing(message, player_id)
        return message

    async def stop(self) -> None:
        if self._deadline_timer:
            self._deadline_timer.cancel()
        self._cancel_deal()
        self._cancel_idle_close()
        for player_id in list(self._away):
            self._cancel_away(player_id)
        for closer in list(self._closers):
            closer.cancel()
        self._task.cancel()
        try:
            await self._task
        except (asyncio.CancelledError, RuntimeError):
            pass

    # ---- the one writer --------------------------------------------------------------------

    async def _run(self) -> None:
        try:
            await self._resume()
        except Exception as error:
            # Never let the start kill the room's only writer: the queue still has to be served
            # (a countdown is set again by the next seat or connection). A hand that could not
            # be resumed (its turn clock may be missing) is not left frozen: the room is
            # suspended, as for any other broken hand, and says so.
            log.exception("room %s: resuming the table failed", self.room.pk)
            if self.hand is not None and not self.suspended:
                try:
                    await self._fail_stop(f"resuming the hand failed: {error}", self.hand.pk)
                except Exception:
                    log.exception("room %s: suspending after a failed resume failed", self.room.pk)
        while True:
            item = await self._queue.get()
            try:
                await self._handle(item)
            except RoomSuspended:
                pass  # already broadcast and logged by _fail_stop
            except Exception as error:
                # Never let one bad item kill the room's only writer.
                log.exception("room %s: error handling %s", self.room.pk, type(item).__name__)
                future = getattr(item, "future", None)
                if future is not None and not future.done():
                    future.set_exception(error)

    async def _resume(self) -> None:
        if self.hand is not None and self.session.current_hand.actor is not None:
            await self._schedule_turn(self.resume_deadline)
        elif self.hand is None and not self.suspended:
            # Restarted between hands: whoever was waiting for a hand that is over by now
            # (finished by _recover, voided by an admin) leaves, and owner changes still waiting
            # apply. No hand just ended, so no pause before the next one.
            await self._between_hands(pause=False)
        if not self.suspended:
            await self._idle_at_start()
            # A new actor has no connection yet: every seated player's absence starts now.
            for player_id in self.session.seats.values():
                self._arm_away(player_id)

    def _task_ended(self, task: asyncio.Task) -> None:
        """The writer's task only ends when stopped; anything else must be loud."""
        if not task.cancelled() and task.exception() is not None:
            log.critical(
                "room %s: its table actor stopped", self.room.pk, exc_info=task.exception()
            )

    async def _handle(self, item: Any) -> None:
        match item:
            case _Connect():
                await self._on_connect(item)
            case _Disconnect():
                await self._on_disconnect(item)
            case _Command():
                await self._on_command(item)
            case _Timeout():
                await self._on_timeout(item)
            case _StartHand():
                await self._on_start_hand(item)
            case _IdleClose():
                await self._on_idle_close(item)
            case _AwayStand():
                await self._on_away_stand(item)
            case _TakeSeat():
                await self._on_take_seat(item)
            case _LeaveSeat():
                await self._on_leave_seat(item)
            case _Chat():
                await self._on_chat(item)
            case _Call():
                try:
                    result = await item.fn()
                except Exception as error:
                    if not item.future.done():  # the caller may have given up (a timeout)
                        item.future.set_exception(error)
                else:
                    if not item.future.done():
                        item.future.set_result(result)

    # ---- connections -------------------------------------------------------------------

    async def _on_connect(self, item: _Connect) -> None:
        player_id = item.player_id
        if await self._is_banned(player_id):
            # Kicked after the consumer checked, before this connection reached the queue.
            layer = get_channel_layer()
            if layer is not None:
                await layer.send(item.channel, {"type": "table.close", "code": KICKED_CLOSE_CODE})
            return
        was_connected = self._connected(player_id)
        self.connections[item.conn] = player_id
        self.channels[item.conn] = item.channel
        if item.name:
            self.names.setdefault(player_id, item.name)
        if player_id in self.session.seats.values() and not was_connected:
            await self._seat_updated(self._seat_of(player_id), exclude=item.conn)
        await self._reply(item.conn, "table.snapshot", {"table": self._table_state(player_id)})
        await self._reply(item.conn, "audience.updated", {"spectators": self._spectators()})
        await self._audience_changed(exclude=item.conn)
        if player_id in self.session.seats.values():
            await self._came_back(player_id)  # after the snapshot: always a client's first message
        await self._maybe_count_down()

    async def _on_disconnect(self, item: _Disconnect) -> None:
        player_id = self.connections.pop(item.conn, None)
        self.channels.pop(item.conn, None)
        if (
            player_id
            and player_id in self.session.seats.values()
            and not self._connected(player_id)
        ):
            await self._seat_updated(self._seat_of(player_id))
            self._arm_away(player_id)
        await self._audience_changed()

    def _connected(self, player_id: str) -> bool:
        return player_id in self.connections.values()

    # ---- away: a seated player gone too long stands up ------------------------------------

    def _arm_away(self, player_id: str) -> None:
        """A seated player with no connection: they stand up after away_stand_seconds()."""
        self._cancel_away(player_id)
        if self._connected(player_id) or player_id not in self.session.seats.values():
            return
        self._away_token += 1
        token = self._away_token
        handle = asyncio.get_running_loop().call_later(
            away_stand_seconds(), lambda: self._queue.put_nowait(_AwayStand(player_id, token))
        )
        self._away[player_id] = (token, handle)

    def _cancel_away(self, player_id: str) -> None:
        entry = self._away.pop(player_id, None)
        if entry is not None:
            entry[1].cancel()

    async def _came_back(self, player_id: str) -> None:
        """Connected again in time: no stand up, and a leave the server set for them (they were
        gone in a hand) is taken back. A leave they asked for themselves stays."""
        self._cancel_away(player_id)
        if player_id in self._away_leaving:
            self._away_leaving.discard(player_id)
            if player_id in self.session.leaving:
                await self._set_leaving(player_id, False)
                await self._maybe_count_down()  # they count for a new hand again

    async def _on_away_stand(self, item: _AwayStand) -> None:
        player_id = item.player_id
        entry = self._away.get(player_id)
        if entry is None or entry[0] != item.token:
            return  # they came back (or sat down again) since: this timer is void
        del self._away[player_id]
        if (
            self.suspended
            or self.closed
            or player_id not in self.session.seats.values()
            or self._connected(player_id)
        ):
            return
        seat = self._seat_of(player_id)
        if self.session._in_hand(player_id):
            # Their clock plays for them; _between_hands stands them up when the hand ends.
            if player_id not in self.session.leaving:
                await self._set_leaving(player_id, True)
                self._away_leaving.add(player_id)
            return
        try:
            # The row first, as in _on_leave_seat: a failed delete leaves them seated everywhere.
            await RoomSeat.objects.filter(room=self.room, user_id=int(player_id)).adelete()
        except Exception:
            log.exception("room %s: standing up %s (away) failed", self.room.pk, player_id)
            self._arm_away(player_id)  # try again after another spell
            return
        self.session.stand_up(player_id)
        self._away_leaving.discard(player_id)
        log.info(
            "room %s: %s stood up after %s s away", self.room.pk, player_id, away_stand_seconds()
        )
        await self._seat_updated(seat)
        await self._track_empty()  # the last one up: the idle close starts

    # ---- commands ------------------------------------------------------------------------

    async def _on_command(self, item: _Command) -> None:
        message = item.message
        command_id = message["command_id"]
        kind = message["type"]
        key = self._dedup_key(kind, message)
        asked = _asked(item.player_id, kind, message["payload"])

        if self.suspended:
            await self._rejected(item.conn, command_id, "room_suspended")
            return
        if key not in self._applied and kind == "command.act":
            await self._remember_from_log(key, item.player_id, message["hand_id"], command_id)
        if key in self._applied and not self._someone_elses_old_command(key, item.player_id):
            first_asked, result_version = self._applied[key]
            if first_asked != asked:
                await self._rejected(item.conn, command_id, "command_id_reused")
                return
            await self._ack(item.conn, command_id, result_version, duplicate=True)
            return

        handler = {
            "command.act": self._act,
            "command.sit_out": self._sit_out,
            "command.sit_in": self._sit_in,
            "command.show_cards": self._show_cards,
        }[kind]
        # The first state event this command would cause; show_cards causes none, only the
        # cards.shown notice, which carries the current version.
        result_version = self.version if kind == "command.show_cards" else self.version + 1
        try:
            await handler(item.player_id, message)
        except Reject as reject:
            await self._rejected(item.conn, command_id, reject.code, str(reject))
            return
        self._applied[key] = (asked, result_version)
        await self._ack(item.conn, command_id, result_version)

    def _someone_elses_old_command(self, key: tuple, player_id: str) -> bool:
        """Another player's command.act id from a hand that is no longer running.

        Not a resend by this sender: handled as a new command it is refused as stale_hand (or
        no_active_hand), without confirming the id exists. Within the running hand a clash
        still says command_id_reused: (hand, command_id) is unique, so it cannot be applied.
        """
        if key[0] != "act":
            return False
        first_asked, _ = self._applied[key]
        running = self.hand is not None and key[1] == self.hand.pk
        return first_asked[0] != player_id and not running

    async def _remember_from_log(
        self, key: tuple, player_id: str, hand_id: Any, command_id: str
    ) -> None:
        """A command for another hand than the running one may still be in the log: the last
        command of a hand that recovery finished (the client resends it after reconnecting).
        Then it is a duplicate (result_version null), not a stale_hand rejection.

        Only this room's hands and the sender's own commands count: anything else is not a
        resend, and a "duplicate" or "reused" answer would confirm that someone else's command
        id exists (in another room, even). It is then handled like any new command.
        """
        if self.hand is not None and hand_id == self.hand.pk:
            return  # the running hand's commands are already in _applied
        stored = await HandCommand.objects.filter(
            hand_id=hand_id,
            hand__room=self.room,
            player_id=int(player_id),
            command_id=command_id,
        ).afirst()
        if stored is not None:
            payload = {"kind": stored.kind, "amount": stored.amount}
            self._applied[key] = (_asked(str(stored.player_id), "command.act", payload), None)

    def _dedup_key(self, kind: str, message: dict[str, Any]) -> tuple:
        if kind == "command.act":
            # Durable, like HandCommand's unique (hand, command_id): _recover() seeds it from
            # the stored commands (kind + amount is the whole payload), with no result_version.
            return ("act", message.get("hand_id"), message["command_id"])
        if kind == "command.show_cards":
            return ("show", message["hand_id"], message["command_id"])
        # sit_out/sit_in: in-memory only per docs/api/ws-protocol.md mục 5; lost on restart.
        return (kind, message["command_id"])

    async def _act(self, player_id: str, message: dict[str, Any]) -> None:
        if self.hand is None:
            raise Reject("no_active_hand")
        engine = self.session.current_hand
        if message["hand_id"] != self.hand.pk:
            raise Reject("stale_hand", f"Hand {self.hand.pk} is running.")
        if player_id not in self.session.seats.values():
            raise Reject("not_seated")
        payload = message["payload"]
        action = Action(player_id, ActionKind(payload["kind"]), payload["amount"])
        try:
            engine.check(action)
        except IllegalAction as error:
            raise Reject(_illegal_action_code(error), str(error)) from None
        await self._write_command(action, message["command_id"])
        await self._apply_checked_action(action, timeout=False)

    async def _sit_out(self, player_id: str, message: dict[str, Any]) -> None:
        if player_id not in self.session.seats.values():
            raise Reject("not_seated")
        if player_id in self.session.sitting_out:
            raise Reject("already_sitting_out")
        self.session.sit_out(player_id)
        await RoomSeat.objects.filter(room=self.room, user_id=int(player_id)).aupdate(
            sitting_out=True
        )
        await self._seat_updated(self._seat_of(player_id))

    async def _show_cards(self, player_id: str, message: dict[str, Any]) -> None:
        """A player of the last finished hand shows their two cards to the whole table, until
        the next hand starts. Stored with the hand (Hand.shown_cards) for its history."""
        if self.hand is not None and message["hand_id"] == self.hand.pk:
            raise Reject("hand_in_progress", "Show your cards once the hand is over.")
        if self._last_hand is None or message["hand_id"] != self._last_hand[0]:
            raise Reject("stale_hand", "Only the last hand, until the next one starts.")
        hand_pk, engine = self._last_hand
        if any(shown["player_id"] == player_id for shown in self._shown):
            raise Reject("already_shown")
        try:
            cards = engine.cards_to_show(player_id)
        except IllegalAction as error:
            raise Reject(error.code, str(error)) from None
        shown = {"player_id": player_id, "seat": engine.seat_of(player_id), "cards": cards}
        try:
            await Hand.objects.filter(pk=hand_pk).aupdate(shown_cards=[*self._shown, shown])
        except Exception as error:  # nothing changed yet: the same command can be sent again
            log.exception("room %s: storing shown cards of hand %s failed", self.room.pk, hand_pk)
            raise Reject("internal_error", "Not saved; send it again.") from error
        self._shown.append(shown)
        # A notice, not a state event: the hand is over, so nothing a snapshot shows changes.
        for conn in list(self.connections):
            await self._send(conn, "cards.shown", shown, hand_pk)

    async def _sit_in(self, player_id: str, message: dict[str, Any]) -> None:
        if player_id not in self.session.seats.values():
            raise Reject("not_seated")
        if player_id not in self.session.sitting_out:
            raise Reject("not_sitting_out")
        self.session.sit_in(player_id)
        await RoomSeat.objects.filter(room=self.room, user_id=int(player_id)).aupdate(
            sitting_out=False
        )
        await self._seat_updated(self._seat_of(player_id))
        await self._maybe_count_down()

    # ---- writing and applying a command (ADR-001 mục 2) -----------------------------------

    async def _write_command(self, action: Action, command_id: str) -> None:
        """Step 2: commit the command before touching the engine. DB failure here is safe to
        retry (nothing applied yet); failure after this point is fail-stop (step 3 onward).
        """
        assert self.hand is not None
        sequence = await HandCommand.objects.filter(hand=self.hand).acount() + 1
        try:
            await HandCommand.objects.acreate(
                hand=self.hand,
                player_id=int(action.player_id),
                sequence=sequence,
                command_id=command_id,
                kind=str(action.kind),
                amount=action.amount,
            )
        except IntegrityError:
            raise Reject("internal_error", "Could not record the command.") from None

    async def _apply_checked_action(self, action: Action, timeout: bool) -> None:
        """Steps 3-4. Everything here is fail-stop: the command is already durable."""
        engine = self.session.current_hand
        try:
            engine.act(action)
        except Exception as error:
            await self._fail_stop(f"act() failed on an already-recorded command: {error}")
            raise RoomSuspended from error
        try:
            await self._after_action(action, timeout=timeout)
        except RoomSuspended:
            raise
        except Exception as error:
            # Applied but not (fully) announced, or the next turn not scheduled: the clients
            # and the clock no longer match the engine. Same rule as above: stop the room.
            log.exception("room %s: error after applying a recorded command", self.room.pk)
            await self._fail_stop(f"error after a recorded command: {error}")
            raise RoomSuspended from error

    async def _on_timeout(self, item: _Timeout) -> None:
        if self.hand is None or self.hand.pk != item.hand_pk or self.suspended:
            return  # the hand (or room) moved on since this timer was scheduled
        engine = self.session.current_hand
        if engine.actor != item.player_id or len(engine._actions) != item.turn:
            return  # a real action for this turn was processed first; the timer lost the race
        actor_player = item.player_id
        legal = engine.legal_actions(actor_player)
        action = Action(actor_player, ActionKind.CHECK if legal.can_check else ActionKind.FOLD)
        command_id = f"{TIMEOUT_COMMAND_PREFIX}{self.hand.pk}-{item.turn + 1}"
        try:
            await self._write_command(action, command_id)
        except Reject:
            # Not recorded, so nothing happened yet: retry rather than leave the table waiting
            # for a clock that already fired.
            log.warning("room %s: could not record %s, retrying", self.room.pk, command_id)
            asyncio.get_running_loop().call_later(
                TIMEOUT_RETRY_SECONDS, lambda: self._queue.put_nowait(item)
            )
            return
        await self._apply_checked_action(action, timeout=True)

    # ---- starting hands ------------------------------------------------------------------

    # ---- when to deal: Start, the countdown, the pause between hands, Pause ---------------

    def _ready_to_deal(self) -> bool:
        """A hand could be dealt now: the owner has the room running, it is healthy and open,
        someone is watching (no hands played to an empty room) and two players have chips."""
        if self.hand is not None or self.suspended or self.closed or self.closing:
            return False
        return self.room.running and bool(self.connections) and self.session.can_start_hand()

    async def _maybe_count_down(self) -> None:
        """Between hands with nothing scheduled and a hand ready to deal (the owner pressed
        Start, a second player sat down or got chips, someone came back): deal in
        START_COUNTDOWN_SECONDS. Never shortens a countdown or a pause already running."""
        if self._next_hand_at is None and self._ready_to_deal():
            await self._schedule_deal(
                _seconds(
                    self.start_countdown, "TABLE_START_COUNTDOWN_SECONDS", START_COUNTDOWN_SECONDS
                )
            )

    async def _schedule_deal(self, seconds: float) -> None:
        self._cancel_deal()
        epoch = self._deal_epoch
        self._next_hand_at = timezone.now() + timedelta(seconds=seconds)
        self._deal_timer = asyncio.get_running_loop().call_later(
            seconds, lambda: self._queue.put_nowait(_StartHand(epoch))
        )
        await self._room_updated()  # next_hand_at: clients show the countdown

    def _cancel_deal(self) -> None:
        self._deal_epoch += 1
        self._next_hand_at = None
        if self._deal_timer is not None:
            self._deal_timer.cancel()
            self._deal_timer = None

    async def _on_start_hand(self, item: _StartHand) -> None:
        if item.epoch != self._deal_epoch:
            return  # paused, closed or rescheduled since: this timer is void
        self._next_hand_at, self._deal_timer = None, None
        if self._ready_to_deal() and await self._deal():
            return  # hand.started tells clients the countdown is over
        # No hand. Either not enough players (or nobody watching) any more: no countdown either,
        # until a seat, chips or a connection makes one possible. Or the hand could not be
        # recorded: a fresh countdown tries again rather than leave the table waiting for nothing.
        await self._maybe_count_down()
        if self._next_hand_at is None:
            await self._room_updated()

    async def _start(self) -> tuple[bool, dict[str, Any]]:
        self._refuse_if_suspended()
        if self.closed or self.closing:
            raise Reject("room_closed")
        started = not self.room.running
        if started:
            await self._set_running(True)
        # Never shortens a countdown or a pause already running. Running already, with a hand
        # ready but nothing scheduled (the table got stuck): it counts down again.
        await self._maybe_count_down()
        if started and self._next_hand_at is None:
            await self._room_updated()  # running, waiting for players (or the hand to end)
        return started, self._room_info()

    async def _pause(self) -> tuple[bool, dict[str, Any]]:
        self._refuse_if_suspended()
        if self.closed or self.closing:
            raise Reject("room_closed")
        paused = self.room.running
        if paused:
            await self._set_running(False)
            self._cancel_deal()  # a running hand is played out; nothing is dealt after it
            await self._room_updated()
        return paused, self._room_info()

    async def _hand_recorded(self, hand_no: int) -> bool:
        """Whether the hand's row exists after all (an unreadable database: assume not, retry)."""
        try:
            return await Hand.objects.filter(room=self.room, hand_no=hand_no).aexists()
        except Exception:
            return False

    async def _set_running(self, running: bool) -> None:
        await Room.objects.filter(pk=self.room.pk).aupdate(running=running)
        self.room.running = running

    async def _deal(self) -> bool:
        """Deal the next hand (callers checked _ready_to_deal). False when it could not be
        recorded: nothing changed, the table is still between hands."""
        previous_button = self.session._button_seat
        try:
            engine = self.session.start_hand()
        except TableError:
            return False  # cannot happen after _ready_to_deal
        hand_no = self.session.hand_no
        try:
            self.hand = await Hand.objects.acreate(
                room=self.room,
                hand_no=hand_no,
                button_seat=engine.config.button_seat,
                config=engine.record()["config"],
            )
        except Exception as error:
            # Nothing recorded, so undo the in-memory start and stay between hands.
            log.exception("room %s: recording hand %s failed", self.room.pk, hand_no)
            self.session.current_hand = None
            self.session.hand_no -= 1
            self.session._button_seat = previous_button
            if isinstance(error, IntegrityError) or await self._hand_recorded(hand_no):
                # The number is taken, or the insert went through and still failed: every retry
                # would fail the same way. Stop until a restart reads what the database holds.
                await self._fail_stop(f"hand {hand_no} could not be recorded: {error}")
            return False
        self._last_hand, self._shown = None, []  # too late to show the previous hand's cards
        await self._broadcast("hand.started", lambda viewer: {"hand": self._hand_view(viewer)})
        if engine.is_complete:
            # Nobody can bet: all in on the antes or the bomb pot but one player, at most. The
            # board was dealt to the end with the hand, which is settled at once.
            await self._complete_hand()
        else:
            await self._schedule_turn()
        return True

    async def _after_action(self, action: Action, timeout: bool) -> None:
        engine = self.session.current_hand
        applied = {
            "player_id": action.player_id,
            "seat": self._seat_of(action.player_id),
            "kind": str(action.kind),
            "amount": action.amount,
            "timeout": timeout,
        }
        await self._broadcast(
            "action.applied", lambda viewer: {"action": applied, "hand": self._hand_view(viewer)}
        )
        if engine.is_complete:
            await self._complete_hand()
        else:
            await self._schedule_turn()

    async def _schedule_turn(self, deadline: datetime | None = None) -> None:
        engine = self.session.current_hand
        now = timezone.now()
        if deadline is None:
            deadline = now + timedelta(seconds=self.room.think_time_seconds)
        turn = {
            "player_id": engine.actor,
            "seat": self._seat_of(engine.actor),
            "deadline": iso(deadline),
            "think_time_seconds": self.room.think_time_seconds,
        }
        if self._deadline_timer:
            self._deadline_timer.cancel()
        self._deadline = deadline
        hand_pk, player_id, turn_no = self.hand.pk, engine.actor, len(engine._actions)
        self._deadline_timer = asyncio.get_running_loop().call_later(
            max(0.0, (deadline - now).total_seconds()),
            lambda: self._queue.put_nowait(_Timeout(hand_pk, player_id, turn_no)),
        )
        await self._broadcast("turn.deadline", lambda viewer: {"turn": turn})

    async def _complete_hand(self) -> None:
        engine = self.session.current_hand
        hand_no, hand_pk = self.session.hand_no, self.hand.pk
        before = len(self.session.ledger)
        # From here on the room is between hands in memory: finish_hand() clears current_hand
        # and self.hand goes with it, with no await in between, so a snapshot read during the
        # save below never shows a hand_id without its hand.
        self.session.finish_hand()
        self.hand = None
        new_entries = self.session.ledger[before:]
        try:
            await asave_completed_hand(self.room, hand_no, engine, new_entries)
        except Exception as error:
            # Not stored, whatever the reason (a conflict, the database down): the in-memory
            # ledger is now ahead of the database, so stop the room. A restart replays and
            # stores the hand (ADR-001 mục 4.3).
            log.exception("room %s: saving hand %s failed", self.room.pk, hand_pk)
            await self._fail_stop(f"save_completed_hand failed: {error}", hand_id=hand_pk)
            raise RoomSuspended from error

        def final_view(viewer: str) -> dict[str, Any]:
            seated = viewer if viewer in engine.player_order else None
            return {"hand_id": hand_pk, "hand_no": hand_no, **engine.view_for(seated)}

        results, seven_deuce = _settlement_payload(engine, new_entries, self.session, self)
        showdown, runouts, rabbit = engine.showdown_hands(), engine.runouts(), engine.rabbit_cards()
        self._last_hand, self._shown = (hand_pk, engine), []
        await self._broadcast(
            "hand.completed",
            lambda viewer: {
                "hand": final_view(viewer),
                "results": results,
                "seven_deuce": seven_deuce,
                "showdown": showdown,
                "runouts": runouts,
                "rabbit_cards": rabbit,
            },
            hand_id=hand_pk,
        )
        await self._between_hands()

    async def _between_hands(self, pause: bool = True) -> None:
        """Players who asked to leave during the hand stand up and the owner's changes made
        during it take effect, then the pause before the next hand when one could be dealt
        (_ready_to_deal: running, two players, someone watching), or after a restart a countdown.
        Until the pause is over nothing else (a new connection, a seat) deals early: players get
        the whole pause to see the result. With no hand possible nothing is scheduled
        (next_hand_at stays null) until a seat, chips or a connection starts a countdown."""
        await self._stand_up_leaving()
        try:
            if self.pending:
                await self._apply_settings()
            if self.closing:
                await self._finish_close()
        except Exception:
            # Not applied, still pending (and stored): log it, but never stall the table.
            log.exception("room %s: applying the owner's changes failed", self.room.pk)
        if not pause:
            await self._maybe_count_down()
        elif self._ready_to_deal():
            await self._schedule_deal(
                _seconds(
                    self.next_hand_delay, "TABLE_HAND_PAUSE_SECONDS", self.room.hand_pause_seconds
                )
            )

    # ---- seats (REST) ----------------------------------------------------------------------

    async def _on_take_seat(self, item: _TakeSeat) -> None:
        player_id = str(item.user.pk)
        try:
            if self.suspended:
                raise Reject("room_suspended")
            if await self._is_banned(player_id):
                raise Reject("kicked")
            if self.closed or self.closing:
                raise Reject("room_closed")
            if player_id in self.session.seats.values():
                raise Reject("already_seated")
            if item.seat in self.session.seats:
                raise Reject("seat_taken")
            if not 1 <= item.seat <= self.room.max_seats:
                raise Reject("invalid_seat")
            try:
                # A row left behind (a stand up whose delete failed) says nothing about this
                # sitting down: a fresh seat, playing.
                await RoomSeat.objects.aupdate_or_create(
                    room=self.room,
                    user=item.user,
                    defaults={"seat": item.seat, "sitting_out": False, "leaving": False},
                )
            except IntegrityError as error:  # the database disagrees: someone has that seat
                raise Reject("seat_taken") from error
            self.session.take_seat(player_id, item.seat)
            self.names[player_id] = item.user.username
            if self.session.stacks.get(player_id, 0) == 0:
                await self._starting_chips(player_id)
            await self._seat_updated(item.seat)
        except (Reject, TableError) as error:
            code = error.code
            item.future.set_exception(Reject(code, str(error)))
        else:
            item.future.set_result(self._occupant(item.seat))
            self._arm_away(player_id)  # seated from the lobby, not at the table yet
            await self._track_empty()  # no longer empty: the idle close is off
            await self._maybe_count_down()

    async def _on_leave_seat(self, item: _LeaveSeat) -> None:
        player_id = str(item.user.pk)
        try:
            if self.suspended:
                raise Reject("room_suspended")
            if player_id not in self.session.seats.values():
                raise Reject("not_seated")
            seat = self._seat_of(player_id)
            self._away_leaving.discard(player_id)  # their own leave now, not the server's
            left_now = not self.session._in_hand(player_id)
            if left_now:
                # The row first, as in _stand_up_leaving: if the delete fails they are still
                # seated, here as in the database, and can try again.
                await RoomSeat.objects.filter(room=self.room, user=item.user).adelete()
                self.session.stand_up(player_id)
            elif player_id not in self.session.leaving:
                # They play the hand out; _between_hands stands them up when it ends.
                await self._set_leaving(player_id, True)
        except (Reject, TableError) as error:
            item.future.set_exception(Reject(error.code, str(error)))
        else:
            if left_now:
                await self._seat_updated(seat)
            item.future.set_result(left_now)
            if left_now:
                await self._track_empty()  # the last one up: the idle close starts

    async def _stay(self, player_id: str) -> dict[str, Any]:
        self._refuse_if_suspended()
        if player_id not in self.session.seats.values():
            raise Reject("not_seated")
        self._away_leaving.discard(player_id)
        if player_id in self.session.leaving:
            await self._set_leaving(player_id, False)
            await self._maybe_count_down()  # they count for a new hand again
        return self._occupant(self._seat_of(player_id))

    async def _set_leaving(self, player_id: str, leaving: bool) -> None:
        """In the database first: a restart before the hand ends must not forget it."""
        await RoomSeat.objects.filter(room=self.room, user_id=int(player_id)).aupdate(
            leaving=leaving
        )
        if leaving:
            self.session.leaving.add(player_id)
        else:
            self.session.leaving.discard(player_id)
        await self._seat_updated(self._seat_of(player_id))

    async def _stand_up_leaving(self) -> None:
        """No hand running any more: whoever asked to leave during it stands up now. Their chips
        stay in the room, as with any stand up."""
        for player_id in sorted(self.session.leaving, key=self._seat_of):
            seat = self._seat_of(player_id)
            try:
                await RoomSeat.objects.filter(room=self.room, user_id=int(player_id)).adelete()
            except Exception:
                # Still seated and still leaving, so never dealt in: the next hand's end, or
                # their next DELETE (in no hand now: at once), frees the seat.
                log.exception("room %s: freeing the seat of %s failed", self.room.pk, player_id)
                continue
            self.session.stand_up(player_id)
            self._away_leaving.discard(player_id)
            await self._seat_updated(seat)
        await self._track_empty()

    # ---- owner actions (B7) ------------------------------------------------------------------

    async def _is_banned(self, player_id: str) -> bool:
        """Read from the database every time: _kick writes the ban before anything queued after
        it runs (so no race), and deleting the row in the admin lifts it at once."""
        return await RoomBan.objects.filter(room=self.room, user_id=int(player_id)).aexists()

    def _refuse_if_suspended(self) -> None:
        if self.suspended:
            raise Reject("room_suspended")

    async def _grant_chips(self, player_id: str, amount: int) -> int:
        self._refuse_if_suspended()
        if player_id not in self.session.seats.values():
            raise Reject("not_seated")
        await self._record_grant(player_id, amount)
        await self._seat_updated(self._seat_of(player_id))
        await self._maybe_count_down()
        return self.session.stacks[player_id]

    async def _rebuy(self, player_id: str) -> int:
        self._refuse_if_suspended()
        if self.closed or self.closing:
            raise Reject("room_closed")
        if player_id not in self.session.seats.values():
            raise Reject("not_seated")
        if self.session._in_hand(player_id):
            raise Reject("player_in_hand")
        if self.session.stacks.get(player_id, 0) > 0:
            raise Reject("has_chips")
        await self._record_grant(player_id, self.room.starting_stack)
        await self._seat_updated(self._seat_of(player_id))
        await self._maybe_count_down()
        return self.session.stacks[player_id]

    async def _starting_chips(self, player_id: str) -> None:
        """Sitting down with nothing in this room: the starting stack, no owner needed. A failed
        write leaves the seat taken with no chips (a rebuy can try again)."""
        try:
            await self._record_grant(player_id, self.room.starting_stack)
        except Exception:
            log.exception("room %s: starting stack for %s not recorded", self.room.pk, player_id)

    async def _record_grant(self, player_id: str, amount: int) -> None:
        """A grant in memory and in the database, or in neither."""
        before = len(self.session.ledger)
        try:
            self.session.grant_chips(player_id, amount)
        except TableError as error:
            raise Reject(error.code, str(error)) from error
        try:
            await LedgerEntry.objects.acreate(
                room=self.room, user_id=int(player_id), kind=LedgerKind.GRANT, amount=amount
            )
        except Exception:
            del self.session.ledger[before:]  # not recorded: undo the in-memory entry too
            raise

    async def _update_settings(self, changes: dict[str, Any]) -> None:
        self._refuse_if_suspended()
        if self.closed:
            raise Reject("room_closed")
        current = {key: getattr(self.room, key) for key in ROOM_SETTINGS}
        merged = {**current, **self.pending, **changes}
        if merged["small_blind"] >= merged["big_blind"]:
            raise Reject("validation_error", "small_blind must be below big_blind", "small_blind")
        if merged["bomb_pot_every"] > 0 and merged["bomb_pot_amount"] == 0:
            raise Reject("validation_error", BOMB_POT_NEEDS_AMOUNT, "bomb_pot_amount")
        highest = max(self.session.seats, default=0)  # a seat being left still counts
        if merged["max_seats"] < highest:
            message = f"max_seats cannot be below {highest}: seat {highest} is taken"
            raise Reject("validation_error", message, "max_seats")
        # IMMEDIATE_SETTINGS never wait in pending: saved now or not at all (a max_seats left
        # pending could fall below a seat taken later, and the database would refuse it).
        now = {key: value for key, value in changes.items() if key in IMMEDIATE_SETTINGS}
        later = {key: value for key, value in changes.items() if key not in IMMEDIATE_SETTINGS}
        # A failed save leaves nothing behind, pending included: the owner got an error.
        kept = dict(self.pending)
        self.pending.update(later)
        try:
            if self.hand is None:
                await self._apply_settings(now)
            else:
                # ``now`` and what waits for the end of the hand in one save: a restart before
                # then does not lose them, and a failed save keeps neither (nor its audit entry).
                await self._apply_settings(now, with_pending=False, store_pending=bool(later))
        except Exception:
            self.pending = kept
            raise

    async def _apply_settings(
        self,
        now: dict[str, Any] | None = None,
        with_pending: bool = True,
        store_pending: bool = False,
    ) -> None:
        """Store and use the owner's changes in one save: ``now`` (IMMEDIATE_SETTINGS) and,
        with_pending (no hand running), everything pending; store_pending (a hand running) also
        writes what waits for the next hand without using it yet."""
        staged = dict(self.pending) if with_pending else {}
        changes = {**staged, **(now or {})}
        before = {key: getattr(self.room, key) for key in changes}
        before_pending = self.room.pending_settings
        for key, value in changes.items():
            setattr(self.room, key, value)
        fields = [*changes]
        if with_pending:
            self.room.pending_settings = {}
            fields.append("pending_settings")
        elif store_pending:
            self.room.pending_settings = dict(self.pending)
            fields.append("pending_settings")
        try:
            await self.room.asave(update_fields=fields)
        except Exception:
            # Not saved: memory goes back to what the database has.
            for key, value in before.items():
                setattr(self.room, key, value)
            self.room.pending_settings = before_pending
            raise
        if with_pending:
            self.pending = {}
        elif not changes:
            return  # only stored for the next hand: nothing changes at the table yet
        self.session.max_seats = self.room.max_seats
        self.session.small_blind = self.room.small_blind
        self.session.big_blind = self.room.big_blind
        for key, value in self.room.engine_rules().items():
            setattr(self.session, key, value)
        await self._room_updated()

    async def _kick(self, user_id: int) -> None:
        player_id = str(user_id)
        if self.suspended and player_id in self.session.seats.values():
            # The broken hand may involve them; a spectator can still be removed (chat abuse).
            raise Reject("room_suspended")
        if self.session._in_hand(player_id):
            raise Reject("player_in_hand")
        seat = self._seat_of(player_id) if player_id in self.session.seats.values() else None
        if seat is not None:
            # the row first: a failed delete leaves the seat as it was, not freed in memory only;
            # then tell the table at once, whatever fails after (a retry finds no seat to free)
            await RoomSeat.objects.filter(room=self.room, user_id=user_id).adelete()
            self.session.stand_up(player_id)
            await self._seat_updated(seat)
            await self._track_empty()
        await RoomBan.objects.aget_or_create(room=self.room, user_id=user_id)
        await RoomMember.objects.filter(room=self.room, user_id=user_id).adelete()
        # Drop their connections first so they get nothing more, then close them.
        kicked = [conn for conn, player in self.connections.items() if player == player_id]
        layer = get_channel_layer()
        for conn in kicked:
            self.connections.pop(conn)
            channel = self.channels.pop(conn, None)
            if channel is not None and layer is not None:
                await layer.send(channel, {"type": "table.close", "code": KICKED_CLOSE_CODE})

    async def _drop_player(self, user_id: int, code: int) -> None:
        player_id = str(user_id)
        dropped = [conn for conn, player in self.connections.items() if player == player_id]
        layer = get_channel_layer()
        for conn in dropped:
            self.connections.pop(conn)
            channel = self.channels.pop(conn, None)
            if channel is not None and layer is not None:
                await layer.send(channel, {"type": "table.close", "code": code})
        if dropped and player_id in self.session.seats.values():
            await self._seat_updated(self._seat_of(player_id))  # shown as disconnected
            self._arm_away(player_id)

    async def _close(self) -> bool:
        self._refuse_if_suspended()
        if self.closed:
            return True
        if self.hand is not None:
            await Room.objects.filter(pk=self.room.pk).aupdate(closing=True)
            self.room.closing = self.closing = True
            return False
        await self._finish_close()
        return True

    async def _finish_close(self) -> None:
        self._cancel_deal()
        empty_since = self.room.empty_since
        self.room.status, self.room.closing = Room.Status.CLOSED, False
        self.room.empty_since = None  # closed: no idle close to count towards
        try:
            await self.room.asave(update_fields=["status", "closing", "empty_since"])
        except Exception:
            self.room.status, self.room.closing = Room.Status.OPEN, self.closing
            self.room.empty_since = empty_since
            raise
        self.closing = False
        self._cancel_idle_close()
        await self._room_updated()

    async def _room_updated(self) -> None:
        await self._broadcast("room.updated", lambda viewer: {"room": self._room_info()})

    # ---- idle close: a room nobody sits in closes itself ----------------------------------

    def _closes_at(self) -> datetime | None:
        """When the room will close itself for being empty, or None (someone is seated, it is
        closed already, or suspended: that waits for an admin)."""
        if self.closed or self.suspended or self.room.empty_since is None:
            return None
        return self.room.empty_since + timedelta(seconds=idle_close_seconds())

    async def _track_empty(self) -> None:
        """After seats changed: Room.empty_since set when the last seated player is gone, cleared
        when someone sits down, and the idle close set or cancelled with it. Clients see
        closes_at change (room.updated)."""
        if self.closed or self.closing:
            return  # closing anyway: no closes_at announced just before "closed"
        if (not self.session.seats) == (self.room.empty_since is not None):
            return
        since = None if self.session.seats else timezone.now()
        self.room.empty_since = since
        try:
            await Room.objects.filter(pk=self.room.pk).aupdate(empty_since=since)
        except Exception:
            # The seat change itself is done. Memory decides here (the close checks the seats
            # in memory); a restart recomputes it from the seats in the database.
            log.exception("room %s: storing empty_since failed", self.room.pk)
        self._arm_idle_close()
        await self._room_updated()

    def _arm_idle_close(self) -> None:
        self._cancel_idle_close()
        closes_at = self._closes_at()
        if closes_at is None:
            return
        epoch = self._idle_epoch
        delay = max(0.0, (closes_at - timezone.now()).total_seconds())
        self._idle_timer = asyncio.get_running_loop().call_later(
            delay, lambda: self._queue.put_nowait(_IdleClose(epoch))
        )

    def _cancel_idle_close(self) -> None:
        self._idle_epoch += 1
        if self._idle_timer is not None:
            self._idle_timer.cancel()
            self._idle_timer = None

    async def _idle_at_start(self) -> None:
        """A new actor (first open since the server started, or the sweep): empty_since from
        the seats in the database, then the idle close, at once if it is past due, before
        anything queued (a seat taken now is too late)."""
        try:
            await self._track_empty()
            if not await self._close_if_idle():
                self._arm_idle_close()
        except Exception:
            # Never stop the room's only writer here; the sweep tries the close again.
            log.exception("room %s: idle close at start failed", self.room.pk)

    async def _on_idle_close(self, item: _IdleClose) -> None:
        if item.epoch != self._idle_epoch:
            return  # someone sat down (or the room closed) since: this timer is void
        self._idle_timer = None
        await self._close_if_idle()

    async def _close_if_idle(self) -> bool:
        closes_at = self._closes_at()
        if closes_at is None or self.session.seats or self.hand is not None or self.closing:
            return False
        if timezone.now() < closes_at:
            self._arm_idle_close()  # woken early: wait for the rest
            return False
        empty_since = self.room.empty_since
        await self._finish_close()  # what the owner's close does between hands
        try:
            await OwnerAction.objects.acreate(
                room=self.room,
                user=None,
                by_staff=False,
                kind=OwnerAction.Kind.AUTO_CLOSE,
                details={"empty_since": iso(empty_since), "idle_seconds": idle_close_seconds()},
            )
        except Exception:
            log.exception("room %s: closed when empty, but the log entry failed", self.room.pk)
        log.info("room %s closed: nobody seated since %s", self.room.pk, iso(empty_since))
        return True

    # ---- fail-stop (ADR-001 mục 5) ---------------------------------------------------------

    async def _fail_stop(self, reason: str, hand_id: int | None = None) -> None:
        log.critical("room %s suspended: %s", self.room.pk, reason)
        self.suspended = True
        self._cancel_deal()
        self._cancel_idle_close()  # a suspended room waits for an admin, open
        await self._broadcast(
            "room.suspended",
            lambda viewer: {"reason": "recovery_needed", "message": SUSPENDED_MESSAGE},
            hand_id=hand_id,
        )

    # ---- state for clients -----------------------------------------------------------------

    def _seat_of(self, player_id: str) -> int:
        for seat, player in self.session.seats.items():
            if player == player_id:
                return seat
        raise KeyError(player_id)

    def _hand_view(self, viewer: str) -> dict[str, Any] | None:
        engine = self.session.current_hand
        if engine is None or self.hand is None:
            # Also while a new hand is dealt in memory but its Hand row is not saved yet
            # (_deal awaits that save): to a snapshot it is still between hands.
            return None
        seated = viewer if viewer in engine.player_order else None
        return {"hand_id": self.hand.pk, "hand_no": self.session.hand_no, **engine.view_for(seated)}

    def _room_info(self) -> dict[str, Any]:
        if self.closed:
            status = "closed"
        elif self.suspended:
            status = "suspended"
        else:
            status = "playing" if self.hand else "open"
        return {
            "room_id": self.room.pk,
            "name": self.room.name,
            "status": status,
            "max_seats": self.room.max_seats,
            "small_blind": self.room.small_blind,
            "big_blind": self.room.big_blind,
            "think_time_seconds": self.room.think_time_seconds,
            "seven_deuce_bonus": self.room.seven_deuce_bonus,
            "starting_stack": self.room.starting_stack,
            "ante": self.room.ante,
            "bomb_pot_every": self.room.bomb_pot_every,
            "bomb_pot_amount": self.room.bomb_pot_amount,
            "run_it_twice": self.room.run_it_twice,
            "rabbit_hunt": self.room.rabbit_hunt,
            "hand_pause_seconds": self.room.hand_pause_seconds,
            "running": self.room.running,
            "next_hand_at": iso(self._next_hand_at) if self._next_hand_at else None,
            "closes_at": iso(closes_at) if (closes_at := self._closes_at()) else None,
        }

    def _occupant(self, seat: int) -> dict[str, Any] | None:
        player_id = self.session.seats.get(seat)
        if player_id is None:
            return None
        return {
            "seat": seat,
            "player_id": player_id,
            "display_name": self.names.get(player_id, player_id),
            "stack": self.session.stacks.get(player_id, 0),
            "sitting_out": player_id in self.session.sitting_out,
            "connected": self._connected(player_id),
            "leaving": player_id in self.session.leaving,
        }

    def _turn_info(self) -> dict[str, Any] | None:
        engine = self.session.current_hand
        if engine is None or self.hand is None or engine.actor is None or self._deadline is None:
            return None
        return {
            "player_id": engine.actor,
            "seat": self._seat_of(engine.actor),
            "deadline": iso(self._deadline),
            "think_time_seconds": self.room.think_time_seconds,
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

    # ---- sending ----------------------------------------------------------------------------

    async def _seat_updated(self, seat: int, exclude: str | None = None) -> None:
        occupant = self._occupant(seat)
        await self._broadcast(
            "seat.updated", lambda viewer: {"seat": seat, "occupant": occupant}, exclude=exclude
        )
        # Someone sat down or stood up: the spectator list may have changed too.
        await self._audience_changed()

    # ---- notices (B8): sent to everyone, version unchanged -----------------------------------

    def _spectators(self) -> list[dict[str, str]]:
        seated = set(self.session.seats.values())
        watching = {p for p in self.connections.values() if p not in seated}
        return [
            {"player_id": p, "display_name": self.names.get(p, p)}
            for p in sorted(watching, key=int)
        ]

    async def _audience_changed(self, exclude: str | None = None) -> None:
        spectators = self._spectators()
        if spectators == self._audience:
            return
        self._audience = spectators
        await self._notice("audience.updated", {"spectators": spectators}, exclude=exclude)

    async def _notice(
        self, type_: str, payload: dict[str, Any], exclude: str | None = None
    ) -> None:
        for conn in list(self.connections):
            if conn != exclude:
                await self._reply(conn, type_, payload)

    async def _on_chat(self, item: _Chat) -> None:
        if not self._connected(item.player_id) or await self._is_banned(item.player_id):
            return  # sent just before a kick closed their socket: not said in this room
        line = await ChatMessage.objects.acreate(
            room=self.room, user_id=int(item.player_id), text=item.text
        )
        message = {
            "message_id": line.pk,
            "player_id": item.player_id,
            "display_name": self.names.get(item.player_id, item.player_id),
            "text": line.text,
            "sent_at": iso(line.created_at),
        }
        await self._notice("chat.message", {"message": message})

    async def _broadcast(self, type_, payload_for, hand_id=None, exclude=None) -> None:
        self.version += 1
        hand_id = hand_id if hand_id is not None else (self.hand.pk if self.hand else None)
        for conn, viewer in list(self.connections.items()):
            if conn == exclude:
                continue
            await self._send(conn, type_, payload_for(viewer), hand_id)

    async def _reply(self, conn: str, type_: str, payload: dict[str, Any]) -> None:
        await self._send(conn, type_, payload, self.hand.pk if self.hand else None)

    async def _ack(self, conn, command_id, result_version, duplicate=False) -> None:
        payload = {
            "command_id": command_id,
            "duplicate": duplicate,
            "result_version": result_version,
        }
        await self._reply(conn, "command.ack", payload)

    async def _rejected(self, conn, command_id, code, message="") -> None:
        # The only trace of a rejected command (ADR-001 mục 3): it never reaches HandCommand.
        log.info(
            "room %s hand %s: rejected command %s from player %s: %s %s",
            self.room.pk,
            self.hand.pk if self.hand else None,
            command_id,
            self.connections.get(conn),
            code,
            message,
        )
        payload = {"command_id": command_id, "code": code, "message": message or code}
        await self._reply(conn, "command.rejected", payload)

    async def _send(self, conn: str, type_: str, payload: dict[str, Any], hand_id) -> None:
        viewer = self.connections.get(conn)
        message = {
            "protocol_version": PROTOCOL_VERSION,
            "type": type_,
            "room_id": self.room.pk,
            "hand_id": hand_id,
            "version": self.version,
            "server_time": iso(),
            "payload": payload,
        }
        if viewer is not None:
            contract.validate_outgoing(message, viewer)
        channel = self.channels.get(conn)
        layer = get_channel_layer()
        if channel is not None and layer is not None:
            try:
                await layer.send(channel, {"type": "table.message", "text": json.dumps(message)})
            except ChannelFull:
                self._drop_full(conn)

    def _drop_full(self, conn: str) -> None:
        """That client stopped reading: drop it rather than fail the whole room for one slow
        socket. It has missed an event, so close its socket as soon as the channel has room;
        the client then reconnects and resyncs from a snapshot."""
        log.warning("room %s: channel full, dropping connection %s", self.room.pk, conn)
        player_id = self.connections.pop(conn, None)
        channel = self.channels.pop(conn, None)
        if player_id is not None:
            self._arm_away(player_id)  # its disconnect will not find it any more
        if channel is None:
            return

        async def close() -> None:
            layer = get_channel_layer()
            for _ in range(CLOSE_ATTEMPTS):
                try:
                    await layer.send(channel, {"type": "table.close", "code": RESYNC_CLOSE_CODE})
                    return
                except ChannelFull:
                    await asyncio.sleep(CLOSE_RETRY_SECONDS)
            log.warning("room %s: could not close full connection %s", self.room.pk, conn)

        closer = asyncio.create_task(close())
        self._closers.add(closer)
        closer.add_done_callback(self._closers.discard)


def _asked(player_id: str, kind: str, payload: dict[str, Any]) -> tuple:
    """What a command asked for, to tell a resend (same) from a reused command_id (different)."""
    return (player_id, kind, json.dumps(payload, sort_keys=True))


def _seconds(override: float | None, setting: str, real: float) -> float:
    """A test's override, else the E2E server's setting (config/settings.py), else the real time.
    No default for the setting: a misspelled name raises instead of quietly using the real time."""
    if override is not None:
        return override
    configured = getattr(settings, setting)
    return real if configured is None else configured


def idle_close_seconds() -> float:
    """How long a room stays open with nobody seated (ROOM_IDLE_CLOSE_SECONDS, overridable)."""
    return _seconds(TableActor.idle_close, "ROOM_IDLE_CLOSE_SECONDS", ROOM_IDLE_CLOSE_SECONDS)


def away_stand_seconds() -> float:
    """How long a seated player may be gone before they stand up (ROOM_AWAY_STAND_SECONDS)."""
    return ROOM_AWAY_STAND_SECONDS if TableActor.away_stand is None else TableActor.away_stand


def _illegal_action_code(error: IllegalAction) -> str:
    return "no_active_hand" if error.code == "hand_complete" else error.code


def _settlement_payload(
    engine: HandEngine, entries: list[EngineLedgerEntry], session: TableSession, actor: TableActor
):
    hand_net = engine.result().net
    bonus_net: dict[str, int] = {}
    for entry in entries:
        if entry.kind == EngineLedgerKind.SEVEN_DEUCE:
            bonus_net[entry.player_id] = bonus_net.get(entry.player_id, 0) + entry.amount
    stacks = session.stacks
    players = sorted(set(hand_net) | set(bonus_net), key=actor._seat_of)
    results = [
        {
            "player_id": p,
            "seat": actor._seat_of(p),
            "hand_net": hand_net.get(p, 0),
            "seven_deuce_net": bonus_net.get(p, 0),
            "stack": stacks.get(p, 0),
        }
        for p in players
    ]
    seven_deuce = None
    winner = engine.seven_deuce_bluff_winner()
    if engine.config.seven_deuce_bonus > 0 and winner is not None:
        public = {p["player_id"]: p["cards"] for p in engine.view_for(None)["players"]}
        payments = [
            {"player_id": p, "seat": actor._seat_of(p), "amount": -bonus_net[p]}
            for p in players
            if bonus_net.get(p, 0) < 0
        ]
        seven_deuce = {
            "player_id": winner,
            "seat": actor._seat_of(winner),
            "cards": public[winner],
            "bonus": engine.config.seven_deuce_bonus,
            "payments": payments,
            "total": sum(p["amount"] for p in payments),
        }
    return results, seven_deuce


# ---- registry and recovery (ADR-001 mục 4) -------------------------------------------------

_actors: dict[int, TableActor] = {}
_lock = asyncio.Lock()


async def get_actor(room_id: int) -> TableActor:
    async with _lock:
        actor = _actors.get(room_id)
        if actor is not None:
            return actor
        actor = await _recover(room_id)
        _actors[room_id] = actor
        return actor


async def drop_player_everywhere(user_id: int, code: int) -> None:
    """Close every socket this player has open, at every table of this process."""
    for actor in list(_actors.values()):
        if not actor.closed:
            await actor.drop_player(user_id, code)


# ---- the idle sweep: rooms past their idle close whose actor is not loaded ------------------

_sweeper: asyncio.Task | None = None
# When this process started serving (start_idle_sweeper). A room with no actor has had nobody
# at its table since then: every connection loads the actor.
_serving_since: datetime | None = None


async def sweep_idle_rooms() -> int:
    """Close every open room nobody has been seated in for idle_close_seconds(); how many.

    A room whose actor is loaded is asked to close itself (it checks again: someone may have
    sat down since). A room with no actor is closed in the database directly, under the
    registry lock: there is no writer to bypass, and get_actor cannot make one meanwhile.
    Loading an actor for it instead would run a full recovery and keep the actor of a closed,
    empty room in memory for the life of the process: after a deploy, one per old empty room.
    One room failing or hanging never stops the sweep.

    First, the away stand up for rooms with no actor (sweep_away_seats)."""
    try:
        await sweep_away_seats()
    except Exception:
        log.exception("away sweep failed")  # the idle close still runs
    due = timezone.now() - timedelta(seconds=idle_close_seconds())
    rooms = Room.objects.exclude(status=Room.Status.CLOSED).filter(empty_since__lte=due)
    closed = 0
    for room_id in [pk async for pk in rooms.order_by("pk").values_list("pk", flat=True)]:
        try:
            closed += await _sweep_room(room_id, due)
        except Exception:
            log.exception("room %s: idle sweep failed", room_id)
    return closed


async def _sweep_room(room_id: int, due: datetime) -> bool:
    async with _lock:
        actor = _actors.get(room_id)
        if actor is None:
            return await _close_unloaded_room(room_id, due)
    if actor._task.done():
        log.error("room %s: its table actor has stopped; not swept", room_id)
        return False
    try:
        await asyncio.wait_for(actor.close_if_idle(), IDLE_SWEEP_ACTOR_TIMEOUT)
    except TimeoutError:
        log.error("room %s: no answer to the idle sweep in %s s", room_id, IDLE_SWEEP_ACTOR_TIMEOUT)
        return False
    return actor.closed


@database_sync_to_async
def _close_unloaded_room(room_id: int, due: datetime) -> bool:
    """The idle close for a room with no actor (callers hold _lock): closed only if it is
    still open, empty since before ``due``, with no seat and no unfinished hand."""
    with transaction.atomic():
        room = (
            Room.objects.select_for_update()
            .exclude(status=Room.Status.CLOSED)
            .filter(pk=room_id, empty_since__lte=due)
            .filter(~Exists(RoomSeat.objects.filter(room=OuterRef("pk"))))
            .filter(~Exists(Hand.objects.filter(room=OuterRef("pk"), completed_at=None)))
            .first()
        )
        if room is None:
            return False
        empty_since = room.empty_since
        Room.objects.filter(pk=room_id).update(
            status=Room.Status.CLOSED, closing=False, empty_since=None
        )
        OwnerAction.objects.create(
            room=room,
            user=None,
            by_staff=False,
            kind=OwnerAction.Kind.AUTO_CLOSE,
            details={"empty_since": iso(empty_since), "idle_seconds": idle_close_seconds()},
        )
    log.info("room %s closed: nobody seated since %s", room_id, iso(empty_since))
    return True


async def sweep_away_seats() -> int:
    """Stand up the players of every open room with no actor, once this process has served for
    away_stand_seconds(): nobody has been at those tables for at least that long. How many rooms.

    A loaded actor times its own players (_arm_away). Here, as in the idle close, the database
    directly under the registry lock instead of loading an actor per old room. A room with an
    unfinished hand is left alone: only its actor can finish the hand (a connection loads it)."""
    if _serving_since is None:
        return 0
    if timezone.now() - _serving_since < timedelta(seconds=away_stand_seconds()):
        return 0
    seated = Exists(RoomSeat.objects.filter(room=OuterRef("pk")))
    rooms = Room.objects.exclude(status=Room.Status.CLOSED).filter(seated)
    emptied = 0
    for room_id in [pk async for pk in rooms.order_by("pk").values_list("pk", flat=True)]:
        try:
            async with _lock:
                if room_id not in _actors:
                    emptied += await _stand_up_unloaded_room(room_id)
        except Exception:
            log.exception("room %s: away sweep failed", room_id)
    return emptied


@database_sync_to_async
def _stand_up_unloaded_room(room_id: int) -> bool:
    """Free every seat of a room with no actor (callers hold _lock); chips stay in the ledger.
    The room is empty from now on: the idle close counts from here."""
    with transaction.atomic():
        room = (
            Room.objects.select_for_update()
            .exclude(status=Room.Status.CLOSED)
            .filter(pk=room_id)
            .filter(~Exists(Hand.objects.filter(room=OuterRef("pk"), completed_at=None)))
            .first()
        )
        if room is None:
            return False
        freed, _ = RoomSeat.objects.filter(room=room).delete()
        if not freed:
            return False
        Room.objects.filter(pk=room_id).update(empty_since=timezone.now())
    log.info("room %s: %s seated player(s) stood up, nobody at the table", room_id, freed)
    return True


async def _sweep_forever() -> None:
    while True:
        try:
            await sweep_idle_rooms()
        except Exception:
            log.exception("idle sweep failed")  # and again next time: never stop sweeping
        # Never longer than the idle time itself (the E2E server shortens it), at least 1 s.
        await asyncio.sleep(min(IDLE_SWEEP_SECONDS, max(1.0, idle_close_seconds())))


def start_idle_sweeper() -> None:
    """Start the sweep in the running event loop, once per process (config/asgi.py calls this
    on every connection; the loop exists only once the server serves)."""
    global _sweeper, _serving_since
    if _serving_since is None:
        _serving_since = timezone.now()
    if _sweeper is None or _sweeper.done():
        _sweeper = asyncio.get_running_loop().create_task(_sweep_forever())


async def reset_registry_for_tests() -> None:
    """Stop and drop every actor, in the event loop that runs them. The registry is a module
    global and would otherwise leak DB objects and background tasks across tests; it also
    stands in for "the process died" in recovery tests.
    """
    global _lock, _sweeper, _serving_since
    _serving_since = None
    if _sweeper is not None:
        _sweeper.cancel()
        try:
            await _sweeper
        except (asyncio.CancelledError, RuntimeError):
            pass
        _sweeper = None
    for actor in list(_actors.values()):
        await actor.stop()
    _actors.clear()
    _lock = asyncio.Lock()


async def _recover(room_id: int) -> TableActor:
    room = await Room.objects.aget(pk=room_id)
    session = TableSession(
        room.small_blind,
        room.big_blind,
        max_seats=room.max_seats,
        shuffle=shuffled_deck,
        **room.engine_rules(),
    )
    names: dict[str, str] = {}
    async for seat in RoomSeat.objects.filter(room=room).select_related("user"):
        session.seats[seat.seat] = str(seat.user_id)
        names[str(seat.user_id)] = seat.user.username
        if seat.sitting_out:
            session.sitting_out.add(str(seat.user_id))
        if seat.leaving:  # freed when the hand ends, or by _run if it is over already
            session.leaving.add(str(seat.user_id))
    async for entry in LedgerEntry.objects.filter(room=room).select_related("hand"):
        session.ledger.append(
            EngineLedgerEntry(
                kind=EngineLedgerKind(entry.kind),
                player_id=str(entry.user_id),
                amount=entry.amount,
                hand_no=entry.hand.hand_no if entry.hand_id else None,
            )
        )

    last_hand = await Hand.objects.filter(room=room).order_by("-hand_no").afirst()
    session.hand_no = last_hand.hand_no if last_hand else 0
    session._button_seat = last_hand.button_seat if last_hand else None

    hand_row: Hand | None = None
    poisoned = False
    # Every unfinished hand, oldest first (ADR-001 mục 4.1), not only the last one: a hand whose
    # save failed must be settled before anything after it. A hand that cannot be rebuilt or
    # stored opens the room suspended (ADR-001 mục 5.4, docs/deploy.md "Bàn tạm dừng").
    unfinished = Hand.objects.filter(room=room, completed_at__isnull=True).order_by("hand_no")
    async for hand in unfinished:
        stored = HandCommand.objects.filter(hand=hand).order_by("sequence")
        commands = [c async for c in stored]
        actions = [
            {"player_id": str(c.player_id), "kind": c.kind, "amount": c.amount} for c in commands
        ]
        try:
            engine = HandEngine.replay({"config": hand.config, "actions": actions})
        except Exception:
            # A recorded command the engine refuses: wait for an admin (void_hand, restart).
            log.exception("room %s: replay of hand %s failed", room.pk, hand.pk)
            session.current_hand, poisoned = None, True
            break
        session.current_hand = engine
        session.hand_no = hand.hand_no
        if engine.is_complete:
            # The process died after the last command but before save_completed_hand(): finish
            # the hand through the normal path so the ledger ends up with exactly one entry
            # set, computed the same way a live completion would (ADR-001 mục 4.3).
            before = len(session.ledger)
            session.finish_hand()
            new_entries = session.ledger[before:]
            try:
                await asave_completed_hand(room, hand.hand_no, engine, new_entries)
            except Exception:
                # Same reason it failed live, most likely: open suspended instead of failing
                # every request to this room.
                log.exception("room %s: replay of hand %s failed to save", room.pk, hand.pk)
                session.current_hand, poisoned = None, True
                break
        elif hand.pk == last_hand.pk:
            hand_row = hand
            # Only what was left of the clock, counted from the last recorded command (or the
            # deal), plus a short grace if that already ran out while the server was down.
            last_event = commands[-1].created_at if commands else hand.created_at
            think = timedelta(seconds=room.think_time_seconds)
            grace = timedelta(seconds=min(RECOVERY_GRACE_SECONDS, room.think_time_seconds))
            resume_deadline = max(last_event + think, timezone.now() + grace)
        else:
            # An older hand still running while a newer one exists cannot be resumed.
            log.error("room %s: hand %s is unfinished but not the last", room.pk, hand.pk)
            session.current_hand, poisoned = None, True
            break
    session.hand_no = last_hand.hand_no if last_hand else 0

    applied: dict[tuple, tuple] = {}
    if hand_row is not None:
        async for c in HandCommand.objects.filter(hand=hand_row):
            # The old result_version died with the process: duplicates get null (protocol mục 5).
            payload = {"kind": c.kind, "amount": c.amount}
            applied[("act", hand_row.pk, c.command_id)] = (
                _asked(str(c.player_id), "command.act", payload),
                None,
            )
    # No await from here on: the actor's task starts at the next one and must see all of this.
    actor = TableActor(room, session, hand_row)
    actor.names.update(names)
    actor._applied.update(applied)
    actor.suspended = poisoned
    actor.pending = dict(room.pending_settings)
    actor.closing = room.closing
    if hand_row is not None:
        actor.resume_deadline = resume_deadline
    return actor
