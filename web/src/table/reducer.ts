// Client state for one table connection: the last table.snapshot plus the state events applied
// on top of it (docs/api/ws-protocol.md §6). Pure: messages to send go to `outbox`, and the
// socket hook drains it, so every protocol rule here can be unit-tested without a socket.

import type {
  ActCommandMessage,
  ChatMessage,
  ActionAppliedMessage,
  AppliedAction,
  ClientMessage,
  HandCompletedMessage,
  HandStartedMessage,
  PlayerResult,
  RejectCode,
  RoomSuspendedMessage,
  RoomUpdatedMessage,
  SeatUpdatedMessage,
  ServerMessage,
  SevenDeuceAward,
  Spectator,
  TableState,
  TurnDeadlineMessage,
} from "@/api/protocol";
import { mergeChat } from "@/rooms/live";

import { cuesFor, type Cue } from "./cues";
import { LOG_KEPT, logFor, type LogEntry } from "./log";

export type StateEvent =
  | HandStartedMessage
  | ActionAppliedMessage
  | TurnDeadlineMessage
  | HandCompletedMessage
  | SeatUpdatedMessage
  | RoomSuspendedMessage
  | RoomUpdatedMessage;

const STATE_EVENTS = new Set<ServerMessage["type"]>([
  "hand.started",
  "action.applied",
  "turn.deadline",
  "hand.completed",
  "seat.updated",
  "room.suspended",
  "room.updated",
]);

/** How long to wait for command.ack / command.rejected before resending the same command. */
export const ACK_TIMEOUT_MS = 5000;

export type PendingCommand = {
  message: ActCommandMessage;
  /** When it last went out on the current connection; null = not sent on this connection yet. */
  sentAt: number | null;
};

export type Notice = { id: number; text: string };

export type TableModel = {
  status: "connecting" | "open" | "reconnecting";
  table: TableState | null;
  lastVersion: number | null;
  /** True from connect (or a resync request) until the next table.snapshot arrives. */
  awaitingSnapshot: boolean;
  buffered: StateEvent[];
  lastAction: AppliedAction | null;
  results: PlayerResult[] | null;
  celebration: SevenDeuceAward | null;
  /** server_time minus local time when the message arrived. */
  clockOffsetMs: number;
  pending: PendingCommand | null;
  outbox: ClientMessage[];
  notice: Notice | null;
  chat: ChatMessage[];
  spectators: Spectator[];
  /** Last action of each seat in the running hand (labels under the seats). */
  lastActions: Record<number, AppliedAction>;
  /** Animation cues of the last state events, newest last (cues.ts). */
  fx: Cue[];
  /** Bumped by every snapshot: animations still running finish at once. */
  fxEpoch: number;
  /** The celebration came from an event re-applied after a snapshot: show it without the moment. */
  celebrationQuiet: boolean;
  /** Side panel log since this page joined (log.ts). */
  log: LogEntry[];
  /** My hole cards in the hand on the table (kept when the completed hand drops them). */
  myCards: string[];
};

/** Cues kept: the player only ever needs the ones not played yet. */
const FX_KEPT = 12;

export type TableAction =
  | { type: "socket.open" }
  | { type: "socket.closed" }
  | { type: "server"; message: ServerMessage; receivedAt: number }
  | { type: "act"; kind: "fold" | "check" | "call" | "raise"; amount?: number; commandId: string }
  | { type: "outbox.sent"; count: number; now: number }
  | { type: "tick"; now: number }
  | { type: "dismiss.celebration" }
  | { type: "dismiss.notice" }
  | { type: "chat.history"; messages: ChatMessage[] }
  | { type: "chat.send"; text: string }
  | { type: "sit"; out: boolean; commandId: string };

export const initialModel = (): TableModel => ({
  status: "connecting",
  table: null,
  lastVersion: null,
  awaitingSnapshot: true,
  buffered: [],
  lastAction: null,
  results: null,
  celebration: null,
  clockOffsetMs: 0,
  pending: null,
  outbox: [],
  notice: null,
  chat: [],
  spectators: [],
  lastActions: {},
  fx: [],
  fxEpoch: 0,
  celebrationQuiet: false,
  log: [],
  myCards: [],
});

const REJECT_TEXT: Partial<Record<RejectCode, string>> = {
  not_your_turn: "Chưa tới lượt bạn.",
  cannot_fold: "Đang được check miễn phí, không cần bỏ bài.",
  cannot_check: "Phải theo thêm chip, không check được.",
  nothing_to_call: "Không có gì để theo, hãy check.",
  cannot_raise: "Không còn được tố.",
  invalid_amount: "Mức tố không hợp lệ.",
  stale_hand: "Ván đó đã xong.",
  no_active_hand: "Không có ván nào đang chạy.",
  not_seated: "Bạn không ngồi ở bàn này.",
  room_suspended: "Bàn đang tạm dừng.",
  rate_limited: "Bấm chậm lại một chút.",
};

function notice(model: TableModel, text: string): Notice {
  return { id: (model.notice?.id ?? 0) + 1, text };
}

export function reduce(model: TableModel, action: TableAction): TableModel {
  switch (action.type) {
    case "socket.open":
      // A new connection starts from its own first snapshot (versions may restart, §6).
      return { ...model, status: "open", awaitingSnapshot: true, lastVersion: null, buffered: [], outbox: [] };
    case "socket.closed":
      return {
        ...model,
        status: "reconnecting",
        outbox: [],
        pending: model.pending && { ...model.pending, sentAt: null },
      };
    case "server":
      return onServer({ ...model, clockOffsetMs: Date.parse(action.message.server_time) - action.receivedAt }, action.message);
    case "act":
      return onIntent(model, action);
    case "outbox.sent": {
      const sent = model.outbox.slice(0, action.count);
      const pending = model.pending;
      const resent = pending && sent.some((m) => m.type === "command.act" && m.command_id === pending.message.command_id);
      return {
        ...model,
        outbox: model.outbox.slice(action.count),
        pending: resent ? { ...pending, sentAt: action.now } : pending,
      };
    }
    case "tick": {
      const pending = model.pending;
      if (!pending || pending.sentAt === null || action.now - pending.sentAt < ACK_TIMEOUT_MS) return model;
      if (model.outbox.includes(pending.message)) return model;
      return { ...model, outbox: [...model.outbox, pending.message] };
    }
    case "dismiss.celebration":
      return { ...model, celebration: null };
    case "dismiss.notice":
      return { ...model, notice: null };
    case "chat.history":
      return { ...model, chat: mergeChat(model.chat, action.messages) };
    case "chat.send": {
      const text = action.text.trim();
      if (!text || !model.table) return model;
      const message: ClientMessage = { protocol_version: 1, type: "chat.send", room_id: model.table.room.room_id, payload: { text } };
      return { ...model, outbox: [...model.outbox, message] };
    }
    case "sit": {
      if (!model.table) return model;
      const message: ClientMessage = {
        protocol_version: 1,
        type: action.out ? "command.sit_out" : "command.sit_in",
        room_id: model.table.room.room_id,
        command_id: action.commandId,
        payload: {},
      };
      return { ...model, outbox: [...model.outbox, message] };
    }
  }
}

function onIntent(model: TableModel, intent: Extract<TableAction, { type: "act" }>): TableModel {
  const hand = model.table?.hand;
  if (model.pending && hand && model.pending.message.hand_id === hand.hand_id) {
    // Same intent clicked again (double click): resend the very same message, never a new id.
    return { ...model, outbox: [...model.outbox, model.pending.message] };
  }
  const legal = hand?.legal_actions;
  if (!hand || !legal || hand.complete || model.table?.room.status === "suspended") return model;

  let payload: ActCommandMessage["payload"];
  if (intent.kind === "raise") {
    if (legal.min_raise_to === null || legal.max_raise_to === null) return model;
    const amount = Math.min(legal.max_raise_to, Math.max(legal.min_raise_to, Math.round(intent.amount ?? legal.min_raise_to)));
    payload = { kind: "raise", amount };
  } else {
    payload = { kind: intent.kind, amount: null };
  }
  const message: ActCommandMessage = {
    protocol_version: 1,
    type: "command.act",
    room_id: model.table!.room.room_id,
    hand_id: hand.hand_id,
    command_id: intent.commandId,
    payload,
  };
  return { ...model, pending: { message, sentAt: null }, outbox: [...model.outbox, message] };
}

function onServer(model: TableModel, message: ServerMessage): TableModel {
  switch (message.type) {
    case "table.snapshot":
      return onSnapshot(model, message.payload.table, message.version);
    case "command.ack":
      if (model.pending?.message.command_id !== message.payload.command_id) return model; // e.g. a duplicate ack
      return { ...model, pending: null };
    case "command.rejected": {
      if (model.pending?.message.command_id !== message.payload.command_id) return model;
      const text = REJECT_TEXT[message.payload.code] ?? "Server không nhận lệnh này.";
      return { ...model, pending: null, notice: notice(model, text) };
    }
    case "protocol.error":
      return { ...model, notice: notice(model, "Server không đọc được message vừa gửi.") };
    case "chat.message":
      return { ...model, chat: mergeChat(model.chat, [message.payload.message]) };
    case "audience.updated":
      return { ...model, spectators: message.payload.spectators };
    default:
      if (STATE_EVENTS.has(message.type)) return onStateEvent(model, message as StateEvent);
      return model;
  }
}

function onSnapshot(model: TableModel, table: TableState, version: number): TableModel {
  // A snapshot is the truth as it is now: no animation for anything it already contains, nor for
  // the events kept while waiting for it (docs/c2-chuyen-dong.md principle 5).
  const sameHand = model.table?.hand?.hand_id === table.hand?.hand_id;
  let next: TableModel = {
    ...model,
    table,
    lastVersion: version,
    awaitingSnapshot: false,
    fxEpoch: model.fxEpoch + 1,
    lastActions: sameHand ? model.lastActions : {},
    myCards: myCards(table, sameHand ? model.myCards : []),
  };
  const buffered = model.buffered.filter((e) => e.version > version).sort((a, b) => a.version - b.version);
  next = { ...next, buffered: [] };
  for (const event of buffered) next = onStateEvent(next, event, true);

  // A command sent before a reconnect is resent unchanged, while its hand is still running.
  const pending = next.pending;
  if (pending) {
    const hand = next.table?.hand;
    if (!hand || hand.complete || hand.hand_id !== pending.message.hand_id) {
      next = { ...next, pending: null };
    } else if (pending.sentAt === null && !next.outbox.includes(pending.message)) {
      next = { ...next, outbox: [...next.outbox, pending.message] };
    }
  }
  return next;
}

function onStateEvent(model: TableModel, event: StateEvent, quiet = false): TableModel {
  if (model.awaitingSnapshot || model.lastVersion === null) {
    return { ...model, buffered: [...model.buffered, event] };
  }
  if (event.version <= model.lastVersion) return model; // already have it
  if (event.version > model.lastVersion + 1) {
    // Missed at least one event: do not apply, ask for a snapshot, keep what comes meanwhile.
    return {
      ...model,
      awaitingSnapshot: true,
      buffered: [...model.buffered, event],
      outbox: [
        ...model.outbox,
        { protocol_version: 1, type: "resync.request", room_id: event.room_id, payload: { last_version: model.lastVersion } },
      ],
    };
  }
  const applied = { ...applyEvent(model, event, quiet), lastVersion: event.version };
  // Events buffered while waiting may now be next in line.
  const next = applied.buffered.find((e) => e.version === event.version + 1);
  if (!next) return applied;
  return onStateEvent({ ...applied, buffered: applied.buffered.filter((e) => e !== next) }, next, quiet);
}

function applyEvent(model: TableModel, event: StateEvent, quiet: boolean): TableModel {
  const entries = logFor(model.table!, event);
  const applied = applyState(model, event);
  const logged = entries.length ? { ...applied, log: [...model.log, ...entries].slice(-LOG_KEPT) } : applied;
  const next = { ...logged, myCards: myCards(logged.table, event.type === "hand.started" ? [] : model.myCards) };
  if (quiet) return { ...next, celebrationQuiet: next.celebration !== model.celebration ? true : next.celebrationQuiet };
  const bodies = cuesFor(model.table!, event);
  if (bodies.length === 0) return next.celebration !== model.celebration ? { ...next, celebrationQuiet: false } : next;
  let id = model.fx.at(-1)?.id ?? 0;
  const cues = bodies.map((body) => ({ ...body, id: ++id }) as Cue);
  return { ...next, fx: [...model.fx, ...cues].slice(-FX_KEPT), celebrationQuiet: false };
}

/** My visible hole cards in the table's hand, or what was kept so far. */
function myCards(table: TableState | null, kept: string[]): string[] {
  const mine = table?.hand?.players.find((p) => p.player_id === table.you.player_id)?.cards ?? [];
  return mine.length && mine.every((c) => c !== "??") ? mine : kept;
}

function applyState(model: TableModel, event: StateEvent): TableModel {
  const table = model.table!;
  switch (event.type) {
    case "hand.started":
      return {
        ...model,
        table: { ...table, hand: event.payload.hand, turn: null },
        lastAction: null,
        results: null,
        lastActions: {},
        celebration: null,
      };
    case "action.applied": {
      const hand = event.payload.hand;
      const turn = table.turn && table.turn.player_id === hand.actor ? table.turn : null;
      // A new street clears the labels, except who folded.
      const street = hand.board.length > (table.hand?.board.length ?? 0);
      const kept = street
        ? Object.fromEntries(Object.entries(model.lastActions).filter(([, a]) => a.kind === "fold"))
        : model.lastActions;
      const action = event.payload.action;
      const lastActions = street && action.kind !== "fold" ? kept : { ...kept, [action.seat]: action };
      return { ...model, table: { ...table, hand, turn }, lastAction: action, lastActions };
    }
    case "turn.deadline":
      return { ...model, table: { ...table, turn: event.payload.turn } };
    case "hand.completed": {
      const { hand, results, seven_deuce } = event.payload;
      const seats = table.seats.map((seat) => {
        const result = results.find((r) => r.player_id === seat.player_id);
        return result ? { ...seat, stack: result.stack } : seat;
      });
      return {
        ...model,
        table: { ...table, hand, turn: null, seats },
        results,
        celebration: seven_deuce ?? model.celebration,
        pending: null,
      };
    }
    case "seat.updated": {
      const { seat, occupant } = event.payload;
      const others = table.seats.filter((s) => s.seat !== seat);
      const seats = occupant ? [...others, occupant] : others;
      // Taking or leaving a seat only comes as seat.updated: `you.seat` follows it, or the page
      // would still draw me as a spectator (and rotate the table around the wrong seat).
      let you = table.you;
      if (occupant?.player_id === you.player_id) you = { ...you, seat };
      else if (you.seat === seat) you = { ...you, seat: null };
      return { ...model, table: { ...table, you, seats: seats.sort((a, b) => a.seat - b.seat) } };
    }
    case "room.suspended":
      return {
        ...model,
        table: { ...table, room: { ...table.room, status: "suspended" }, turn: null },
        notice: notice(model, "Bàn tạm dừng để khôi phục. Chờ một chút rồi trang sẽ tự nối lại."),
      };
    case "room.updated": {
      // The owner's new settings (or the room closing) take effect between hands (B7).
      const room = event.payload.room;
      const closed = room.status === "closed" && table.room.status !== "closed";
      return {
        ...model,
        table: { ...table, room },
        notice: closed ? notice(model, "Chủ phòng đã đóng phòng. Không có ván mới.") : model.notice,
      };
    }
  }
}
