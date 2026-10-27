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
from .models import Hand, HandCommand, LedgerEntry, Room, RoomSeat, User
from .services import save_completed_hand

# save_completed_hand() is synchronous (one transaction.atomic block); run it in a thread.
asave_completed_hand = database_sync_to_async(save_completed_hand)

log = logging.getLogger("games.actor")
PROTOCOL_VERSION = 1


def iso(moment: datetime | None = None) -> str:
    moment = moment or datetime.now(UTC)
    return moment.strftime("%Y-%m-%dT%H:%M:%S.") + f"{moment.microsecond // 1000:03d}Z"


class Reject(Exception):
    def __init__(self, code: str, message: str = ""):
        super().__init__(message or code)
        self.code = code


class RoomSuspended(Exception):
    """Raised internally to stop processing after a hand-breaking error (ADR-001 mục 5)."""


# ---- queue items: everything that can change a room goes through the one queue ------------


@dataclass
class _Connect:
    conn: str
    channel: str
    player_id: str


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
        self._pausing = False  # between two hands, waiting for next_hand_delay
        self._task = asyncio.create_task(self._run())

    # ---- public: called from consumers/views, never touches the engine directly -----------

    def connect(self, conn: str, channel: str, player_id: str) -> None:
        self._queue.put_nowait(_Connect(conn, channel, player_id))

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
        self._task.cancel()
        try:
            await self._task
        except (asyncio.CancelledError, RuntimeError):
            pass

    # ---- the one writer --------------------------------------------------------------------

    async def _run(self) -> None:
        if self.hand is not None and self.session.current_hand.actor is not None:
            # Recovered mid-hand: the player to act gets a full clock again (ADR-001 mục 4.5
            # leaves "full time or what was left" to B5).
            await self._schedule_turn()
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

    # ---- connections -------------------------------------------------------------------

    async def _on_connect(self, item: _Connect) -> None:
        player_id = item.player_id
        was_connected = self._connected(player_id)
        self.connections[item.conn] = player_id
        self.channels[item.conn] = item.channel
        if player_id in self.session.seats.values() and not was_connected:
            await self._seat_updated(self._seat_of(player_id), exclude=item.conn)
        await self._reply(item.conn, "table.snapshot", {"table": self._table_state(player_id)})
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
            await self._remember_from_log(key, message["hand_id"], command_id)
        if key in self._applied:
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
        }[kind]
        result_version = self.version + 1  # the first state event this command would cause
        try:
            await handler(item.player_id, message)
        except Reject as reject:
            await self._rejected(item.conn, command_id, reject.code, str(reject))
            return
        self._applied[key] = (asked, result_version)
        await self._ack(item.conn, command_id, result_version)

    async def _remember_from_log(self, key: tuple, hand_id: Any, command_id: str) -> None:
        """A command for another hand than the running one may still be in the log: the last
        command of a hand that recovery finished (the client resends it after reconnecting).
        Then it is a duplicate (result_version null), not a stale_hand rejection.
        """
        if self.hand is not None and hand_id == self.hand.pk:
            return  # the running hand's commands are already in _applied
        stored = await HandCommand.objects.filter(hand_id=hand_id, command_id=command_id).afirst()
        if stored is not None:
            payload = {"kind": stored.kind, "amount": stored.amount}
            self._applied[key] = (_asked(str(stored.player_id), "command.act", payload), None)

    def _dedup_key(self, kind: str, message: dict[str, Any]) -> tuple:
        if kind == "command.act":
            # Durable, like HandCommand's unique (hand, command_id): _recover() seeds it from
            # the stored commands (kind + amount is the whole payload), with no result_version.
            return ("act", message.get("hand_id"), message["command_id"])
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
        await self._broadcast("hand.started", lambda viewer: {"hand": self._hand_view(viewer)})
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

    async def _schedule_turn(self) -> None:
        engine = self.session.current_hand
        deadline = timezone.now() + timedelta(seconds=self.room.think_time_seconds)
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
            self.room.think_time_seconds,
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
            # Not stored, whatever the reason (a conflict, the database down): the ledger in
            # memory is now ahead of the database, so the room must stop here. A restart
            # replays the hand and stores it (ADR-001 mục 4.3).
            log.exception("room %s: saving hand %s failed", self.room.pk, hand_pk)
            await self._fail_stop(f"save_completed_hand failed: {error}", hand_id=hand_pk)
            raise RoomSuspended from error

        def final_view(viewer: str) -> dict[str, Any]:
            seated = viewer if viewer in engine.player_order else None
            return {"hand_id": hand_pk, "hand_no": hand_no, **engine.view_for(seated)}

        results, seven_deuce = _settlement_payload(engine, new_entries, self.session, self)
        await self._broadcast(
            "hand.completed",
            lambda viewer: {
                "hand": final_view(viewer),
                "results": results,
                "seven_deuce": seven_deuce,
            },
            hand_id=hand_pk,
        )
        self._schedule_next_hand()

    # ---- seats (REST) ----------------------------------------------------------------------

    async def _on_take_seat(self, item: _TakeSeat) -> None:
        player_id = str(item.user.pk)
        try:
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

    # ---- fail-stop (ADR-001 mục 5) ---------------------------------------------------------

    async def _fail_stop(self, reason: str, hand_id: int | None = None) -> None:
        log.critical("room %s suspended: %s", self.room.pk, reason)
        self.suspended = True
        await self._broadcast(
            "room.suspended",
            lambda viewer: {"reason": "recovery_needed", "message": reason},
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
        status = "suspended" if self.suspended else ("playing" if self.hand else "open")
        return {
            "room_id": self.room.pk,
            "name": self.room.name,
            "status": status,
            "max_seats": self.room.max_seats,
            "small_blind": self.room.small_blind,
            "big_blind": self.room.big_blind,
            "think_time_seconds": self.room.think_time_seconds,
            "seven_deuce_bonus": self.room.seven_deuce_bonus,
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

    async def _broadcast(self, type_, payload_for, hand_id=None, exclude=None) -> None:
        self.version += 1
        hand_id = hand_id if hand_id is not None else (self.hand.pk if self.hand else None)
        for conn, viewer in list(self.connections.items()):
            if conn == exclude:
                continue
            try:
                await self._send(conn, type_, payload_for(viewer), hand_id)
            except ChannelFull:
                # That client stopped reading: drop it (it resyncs from a snapshot when it
                # reconnects) rather than fail the whole room for one slow socket.
                log.warning("room %s: channel full, dropping connection %s", self.room.pk, conn)
                self.connections.pop(conn, None)
                self.channels.pop(conn, None)

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
            await layer.send(channel, {"type": "table.message", "text": json.dumps(message)})


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
        seven_deuce_bonus=room.seven_deuce_bonus,
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
    # Every unfinished hand, oldest first (ADR-001 mục 4.1), not only the last one: a hand whose
    # save failed must be settled before anything after it.
    unfinished = Hand.objects.filter(room=room, completed_at__isnull=True).order_by("hand_no")
    async for hand in unfinished:
        actions = [
            {"player_id": str(c.player_id), "kind": c.kind, "amount": c.amount}
            async for c in HandCommand.objects.filter(hand=hand).order_by("sequence")
        ]
        engine = HandEngine.replay({"config": hand.config, "actions": actions})
        session.current_hand = engine
        session.hand_no = hand.hand_no
        if engine.is_complete:
            # The process died after the last command but before save_completed_hand(): finish
            # the hand through the normal path so the ledger ends up with exactly one entry
            # set, computed the same way a live completion would (ADR-001 mục 4.3).
            before = len(session.ledger)
            session.finish_hand()
            new_entries = session.ledger[before:]
            await asave_completed_hand(room, hand.hand_no, engine, new_entries)
        elif hand.pk == last_hand.pk:
            hand_row = hand
        else:
            # An older hand still running while a newer one exists cannot be resumed.
            raise RuntimeError(f"room {room.pk}: hand {hand.pk} is unfinished but not the last")
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
    actor = TableActor(room, session, hand_row)
    actor.names.update(names)
    actor._applied.update(applied)
    return actor
