// Client state for one table connection: the last table.snapshot plus the state events applied
// on top of it (docs/api/ws-protocol.md §6). Pure: messages to send go to `outbox`, and the
// socket hook drains it, so every protocol rule here can be unit-tested without a socket.

import type {
  ActCommandMessage,
  ActionAppliedMessage,
  AppliedAction,
  ClientMessage,
  HandCompletedMessage,
  HandStartedMessage,
  PlayerResult,
  RejectCode,
  RoomSuspendedMessage,
  SeatUpdatedMessage,
  ServerMessage,
  SevenDeuceAward,
  TableState,
  TurnDeadlineMessage,
} from "@/api/protocol";

export type StateEvent =
  | HandStartedMessage
  | ActionAppliedMessage
  | TurnDeadlineMessage
  | HandCompletedMessage
  | SeatUpdatedMessage
  | RoomSuspendedMessage;

const STATE_EVENTS = new Set<ServerMessage["type"]>([
  "hand.started",
  "action.applied",
  "turn.deadline",
  "hand.completed",
  "seat.updated",
  "room.suspended",
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
};

export type TableAction =
  | { type: "socket.open" }
  | { type: "socket.closed" }
  | { type: "server"; message: ServerMessage; receivedAt: number }
  | { type: "act"; kind: "fold" | "check" | "call" | "raise"; amount?: number; commandId: string }
  | { type: "outbox.sent"; count: number; now: number }
  | { type: "tick"; now: number }
  | { type: "dismiss.celebration" }
  | { type: "dismiss.notice" };

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
    default:
      if (STATE_EVENTS.has(message.type)) return onStateEvent(model, message as StateEvent);
      return model;
  }
}

function onSnapshot(model: TableModel, table: TableState, version: number): TableModel {
  let next: TableModel = { ...model, table, lastVersion: version, awaitingSnapshot: false };
  const buffered = model.buffered.filter((e) => e.version > version).sort((a, b) => a.version - b.version);
  next = { ...next, buffered: [] };
  for (const event of buffered) next = onStateEvent(next, event);

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

function onStateEvent(model: TableModel, event: StateEvent): TableModel {
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
  const applied = { ...applyEvent(model, event), lastVersion: event.version };
  // Events buffered while waiting may now be next in line.
  const next = applied.buffered.find((e) => e.version === event.version + 1);
  if (!next) return applied;
  return onStateEvent({ ...applied, buffered: applied.buffered.filter((e) => e !== next) }, next);
}

function applyEvent(model: TableModel, event: StateEvent): TableModel {
  const table = model.table!;
  switch (event.type) {
    case "hand.started":
      return { ...model, table: { ...table, hand: event.payload.hand, turn: null }, lastAction: null, results: null };
    case "action.applied": {
      const hand = event.payload.hand;
      const turn = table.turn && table.turn.player_id === hand.actor ? table.turn : null;
      return { ...model, table: { ...table, hand, turn }, lastAction: event.payload.action };
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
      const others = table.seats.filter((s) => s.seat !== event.payload.seat);
      const seats = event.payload.occupant ? [...others, event.payload.occupant] : others;
      return { ...model, table: { ...table, seats: seats.sort((a, b) => a.seat - b.seat) } };
    }
    case "room.suspended":
      return {
        ...model,
        table: { ...table, room: { ...table.room, status: "suspended" }, turn: null },
        notice: notice(model, "Bàn tạm dừng để khôi phục. Chờ một chút rồi trang sẽ tự nối lại."),
      };
  }
}
