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
from django.db import IntegrityError
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
    pass


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


# Settings the owner may change (PATCH /api/rooms/{id}/); they apply between hands.
ROOM_SETTINGS = (
    "name",
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
)
KICKED_CLOSE_CODE = 4403
BOMB_POT_NEEDS_AMOUNT = "bomb_pot_amount must be above 0 while bomb_pot_every is on"
# A client that stopped reading (its channel is full) is dropped, then its socket is closed with
# this code once the channel has room: the client reconnects and gets a fresh snapshot.
RESYNC_CLOSE_CODE = 4408
CLOSE_RETRY_SECONDS = 1.0
CLOSE_ATTEMPTS = 30
# What clients see when a room stops (fail-stop). The cause goes to the server log only: an
# engine error can quote the deck or someone's hole cards.
SUSPENDED_MESSAGE = "The table stopped after a server error and waits for recovery."


class TableActor:
    # Pause between two hands so players can see the result; tests set it to 0.
    next_hand_delay = 4.0

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
        self._pausing = False  # between two hands, waiting for next_hand_delay
        self._closers: set[asyncio.Task] = set()  # see _drop_full
        # The last finished hand, whose players may show their cards until the next hand
        # starts (command.show_cards), and what was shown. In memory only: lost on a restart.
        self._last_hand: tuple[int, HandEngine] | None = None
        self._shown: list[dict[str, Any]] = []
        self._task = asyncio.create_task(self._run())

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

    async def leave_seat(self, user: User) -> None:
        future: asyncio.Future = asyncio.get_running_loop().create_future()
        self._queue.put_nowait(_LeaveSeat(user, future))
        await future

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
        for closer in list(self._closers):
            closer.cancel()
        self._task.cancel()
        try:
            await self._task
        except (asyncio.CancelledError, RuntimeError):
            pass

    # ---- the one writer --------------------------------------------------------------------

    async def _run(self) -> None:
        if self.hand is not None and self.session.current_hand.actor is not None:
            await self._schedule_turn(self.resume_deadline)
        elif self.hand is None and not self.suspended:
            # Restarted between hands with owner changes still waiting: apply them now. No
            # hand just ended, so no pause before the next one.
            await self._between_hands(pause=False)
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
                self._pausing = False
                await self._maybe_start_hand()
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
                    item.future.set_exception(error)
                else:
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
        await self._maybe_start_hand()

    async def _on_disconnect(self, item: _Disconnect) -> None:
        player_id = self.connections.pop(item.conn, None)
        self.channels.pop(item.conn, None)
        if (
            player_id
            and player_id in self.session.seats.values()
            and not self._connected(player_id)
        ):
            await self._seat_updated(self._seat_of(player_id))
        await self._audience_changed()

    def _connected(self, player_id: str) -> bool:
        return player_id in self.connections.values()

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
        if self.hand is None:
            self._queue.put_nowait(_StartHand())

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

    async def _maybe_start_hand(self) -> None:
        """Deal a new hand when none is running, the room is healthy and someone is watching
        (like the mock: no hands played to an empty room).
        """
        if self.hand is not None or self.suspended or self._pausing or not self.connections:
            return
        if self.closed or self.closing:
            return
        previous_button = self.session._button_seat
        try:
            engine = self.session.start_hand()
        except TableError:
            return  # fewer than two players with chips; try again when seats change
        try:
            self.hand = await Hand.objects.acreate(
                room=self.room,
                hand_no=self.session.hand_no,
                button_seat=engine.config.button_seat,
                config=engine.record()["config"],
            )
        except Exception:
            # Nothing recorded, so undo the in-memory start and stay between hands.
            self.session.current_hand = None
            self.session.hand_no -= 1
            self.session._button_seat = previous_button
            raise
        self._last_hand, self._shown = None, []  # too late to show the previous hand's cards
        await self._broadcast("hand.started", lambda viewer: {"hand": self._hand_view(viewer)})
        if engine.is_complete:
            # Nobody can bet: all in on the antes or the bomb pot but one player, at most. The
            # board was dealt to the end with the hand, which is settled at once.
            await self._complete_hand()
        else:
            await self._schedule_turn()

    def _schedule_next_hand(self) -> None:
        # Until _StartHand arrives, nothing else (a new connection, a seat) starts the next hand
        # early: players get the whole pause to see the result.
        self._pausing = True
        asyncio.get_running_loop().call_later(
            self.next_hand_delay, lambda: self._queue.put_nowait(_StartHand())
        )

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
        """The owner's changes made during the hand take effect, then the next hand (or none)."""
        try:
            if self.pending:
                await self._apply_settings()
            if self.closing:
                await self._finish_close()
        except Exception:
            # Not applied, still pending (and stored): log it, but never stall the table.
            log.exception("room %s: applying the owner's changes failed", self.room.pk)
        if pause and not self.closed and not self.closing:
            self._schedule_next_hand()

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
                await RoomSeat.objects.aupdate_or_create(
                    room=self.room, user=item.user, defaults={"seat": item.seat}
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
            await self._maybe_start_hand()

    async def _on_leave_seat(self, item: _LeaveSeat) -> None:
        player_id = str(item.user.pk)
        try:
            if self.suspended:
                raise Reject("room_suspended")
            if player_id not in self.session.seats.values():
                raise Reject("not_seated")
            seat = self._seat_of(player_id)
            self.session.stand_up(player_id)
            await RoomSeat.objects.filter(room=self.room, user=item.user).adelete()
        except (Reject, TableError) as error:
            item.future.set_exception(Reject(error.code, str(error)))
        else:
            await self._seat_updated(seat)
            item.future.set_result(None)

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
        await self._maybe_start_hand()
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
        await self._maybe_start_hand()
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
        current = {key: getattr(self.room, key) for key in ROOM_SETTINGS}
        merged = {**current, **self.pending, **changes}
        if merged["small_blind"] >= merged["big_blind"]:
            raise Reject("validation_error", "small_blind must be below big_blind", "small_blind")
        if merged["bomb_pot_every"] > 0 and merged["bomb_pot_amount"] == 0:
            raise Reject("validation_error", BOMB_POT_NEEDS_AMOUNT, "bomb_pot_amount")
        if self.hand is None:
            self.pending.update(changes)
            await self._apply_settings()
            return
        # Kept in the database too, so a restart before the hand ends does not lose them.
        await Room.objects.filter(pk=self.room.pk).aupdate(
            pending_settings={**self.pending, **changes}
        )
        self.pending.update(changes)
        self.room.pending_settings = dict(self.pending)

    async def _apply_settings(self) -> None:
        changes = dict(self.pending)
        before = {key: getattr(self.room, key) for key in changes}
        for key, value in changes.items():
            setattr(self.room, key, value)
        self.room.pending_settings = {}
        try:
            await self.room.asave(update_fields=[*changes, "pending_settings"])
        except Exception:
            # Not saved: memory goes back to what the database has.
            for key, value in before.items():
                setattr(self.room, key, value)
            self.room.pending_settings = changes
            raise
        self.pending = {}
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
            self.session.stand_up(player_id)
            await RoomSeat.objects.filter(room=self.room, user_id=user_id).adelete()
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
        if seat is not None:
            await self._seat_updated(seat)

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
        self.room.status, self.room.closing = Room.Status.CLOSED, False
        try:
            await self.room.asave(update_fields=["status", "closing"])
        except Exception:
            self.room.status, self.room.closing = Room.Status.OPEN, self.closing
            raise
        self.closing = False
        await self._room_updated()

    async def _room_updated(self) -> None:
        await self._broadcast("room.updated", lambda viewer: {"room": self._room_info()})

    # ---- fail-stop (ADR-001 mục 5) ---------------------------------------------------------

    async def _fail_stop(self, reason: str, hand_id: int | None = None) -> None:
        log.critical("room %s suspended: %s", self.room.pk, reason)
        self.suspended = True
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
            # (_maybe_start_hand awaits that save): to a snapshot it is still between hands.
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
        self.connections.pop(conn, None)
        channel = self.channels.pop(conn, None)
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


async def reset_registry_for_tests() -> None:
    """Stop and drop every actor, in the event loop that runs them. The registry is a module
    global and would otherwise leak DB objects and background tasks across tests; it also
    stands in for "the process died" in recovery tests.
    """
    global _lock
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
