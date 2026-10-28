import { describe, expect, it } from "vitest";
import type {
  ActCommandMessage,
  ActionAppliedMessage,
  AppliedAction,
  CommandAckMessage,
  CommandRejectedMessage,
  HandCompletedMessage,
  HandStartedMessage,
  HandView,
  LegalActions,
  ServerMessage,
  ShowdownHand,
  TableSnapshotMessage,
  TurnDeadlineMessage,
} from "@/api/protocol";
import ackFixture from "../../../docs/api/fixtures/server/valid/command.ack.json";
import duplicateAckFixture from "../../../docs/api/fixtures/server/valid/command.ack.duplicate.json";
import raiseFixture from "../../../docs/api/fixtures/server/valid/action.applied.raise.json";
import rejectedFixture from "../../../docs/api/fixtures/server/valid/command.rejected.not-your-turn.json";
import sevenDeuceFixture from "../../../docs/api/fixtures/server/valid/hand.completed.seven-deuce.json";
import snapshotFixture from "../../../docs/api/fixtures/server/valid/table.snapshot.between-hands.json";
import startedFixture from "../../../docs/api/fixtures/server/valid/hand.started.json";
import deadlineFixture from "../../../docs/api/fixtures/server/valid/turn.deadline.json";
import { initialModel, reduce, type PreActionKind, type TableAction, type TableModel } from "./reducer";

// Fixtures from docs/api/: Lym's view of hand 41 (snapshot v11, hand.started v12, turn v13, raise v14).
const snapshot = snapshotFixture as unknown as TableSnapshotMessage;
const started = startedFixture as unknown as HandStartedMessage;
const deadline = deadlineFixture as unknown as TurnDeadlineMessage;
const raised = raiseFixture as unknown as ActionAppliedMessage;
const sevenDeuce = sevenDeuceFixture as unknown as HandCompletedMessage;

const T0 = Date.parse("2026-10-27T14:03:05.120Z");
const server = (message: ServerMessage, receivedAt = T0): TableAction => ({ type: "server", message, receivedAt });
const run = (actions: TableAction[], model: TableModel = initialModel()) => actions.reduce(reduce, model);
const connected = () => run([{ type: "socket.open" }, server(snapshot)]);
const act = (commandId: string, kind: "fold" | "check" | "call" | "raise" = "raise", amount?: number): TableAction => ({
  type: "act",
  kind,
  amount,
  commandId,
});
const sentCommands = (model: TableModel) => model.outbox.filter((m): m is ActCommandMessage => m.type === "command.act");
const withVersion = <M extends ServerMessage>(message: M, version: number): M => ({ ...message, version });

describe("applying events", () => {
  it("replaces the whole table with a snapshot and takes its version", () => {
    const model = connected();
    expect(model.table?.seats.map((s) => s.display_name)).toEqual(["Lym", "An", "Bình"]);
    expect(model.lastVersion).toBe(11);
    expect(model.awaitingSnapshot).toBe(false);
  });

  it("applies events in order and advances last_version", () => {
    const model = run([server(started), server(deadline), server(raised)], connected());
    expect(model.lastVersion).toBe(14);
    expect(model.table?.hand?.players[0]).toMatchObject({ player_id: "1", stack: 970, bet: 30 });
    expect(model.lastAction).toMatchObject({ kind: "raise", amount: 30 });
  });

  it("keeps events that arrive before the first snapshot and applies them after it", () => {
    const model = run([{ type: "socket.open" }, server(started), server(snapshot)]);
    expect(model.lastVersion).toBe(12);
    expect(model.table?.hand?.hand_id).toBe(41);
  });

  it("ignores an event it already has (same or older version)", () => {
    const once = run([server(started), server(deadline), server(raised)], connected());
    const twice = run([server(raised), server(started)], once);
    expect(twice.table).toEqual(once.table);
    expect(twice.lastVersion).toBe(14);
  });

  it("records the turn and drops it when the actor changes", () => {
    const onTurn = run([server(started), server(deadline)], connected());
    expect(onTurn.table?.turn?.player_id).toBe("1");
    const after = reduce(onTurn, server(raised));
    expect(after.table?.turn).toBeNull();
  });

  it("measures the server clock offset from server_time", () => {
    const model = reduce(connected(), server(deadline, T0 - 2000));
    expect(model.clockOffsetMs).toBe(2000);
  });
});

describe("missing a version", () => {
  it("does not apply the event, asks for a resync once and buffers what follows", () => {
    const gap = run([server(started), server(raised)], connected()); // v13 never arrived
    expect(gap.lastVersion).toBe(12);
    expect(gap.table?.hand?.players[0].bet).toBe(0);
    expect(gap.outbox).toEqual([
      { protocol_version: 1, type: "resync.request", room_id: 1, payload: { last_version: 12 } },
    ]);
    const more = reduce(gap, server(withVersion(raised, 15)));
    expect(more.outbox.filter((m) => m.type === "resync.request")).toHaveLength(1);
    expect(more.buffered.map((e) => e.version)).toEqual([14, 15]);
  });

  it("replaces state with the resync snapshot, then applies the buffered newer events", () => {
    const gap = run([server(started), server(raised)], connected());
    const resyncSnapshot: TableSnapshotMessage = {
      ...snapshot,
      hand_id: 41,
      version: 13,
      payload: { table: { ...snapshot.payload.table, hand: started.payload.hand, turn: deadline.payload.turn } },
    };
    const model = reduce(gap, server(resyncSnapshot));
    expect(model.lastVersion).toBe(14);
    expect(model.awaitingSnapshot).toBe(false);
    expect(model.buffered).toEqual([]);
    expect(model.table?.hand?.players[0].bet).toBe(30);
  });
});

describe("commands", () => {
  const myTurn = () => run([server(started), server(deadline)], connected());

  it("sends one command.act built from the intent", () => {
    const model = reduce(myTurn(), act("A", "raise", 30));
    expect(sentCommands(model)).toEqual([
      {
        protocol_version: 1,
        type: "command.act",
        room_id: 1,
        hand_id: 41,
        command_id: "A",
        payload: { kind: "raise", amount: 30 },
      },
    ]);
    expect(model.pending?.message.command_id).toBe("A");
  });

  it("call, check and fold carry amount null", () => {
    const model = reduce(myTurn(), act("C", "call"));
    expect(sentCommands(model)[0].payload).toEqual({ kind: "call", amount: null });
  });

  it("a double click resends the same command_id instead of a new one", () => {
    const model = run([act("A", "raise", 30), act("B", "raise", 30)], myTurn());
    expect(sentCommands(model).map((m) => m.command_id)).toEqual(["A", "A"]);
    expect(model.pending?.message.command_id).toBe("A");
  });

  it("applies the action once even when the server acks twice", () => {
    const ack = { ...(ackFixture as unknown as CommandAckMessage), payload: { ...(ackFixture as unknown as CommandAckMessage).payload, command_id: "A" } };
    const dup = { ...(duplicateAckFixture as unknown as CommandAckMessage), payload: { ...(duplicateAckFixture as unknown as CommandAckMessage).payload, command_id: "A" } };
    const model = run([act("A", "raise", 30), server(raised), server(ack), server(dup), server(raised)], myTurn());
    expect(model.pending).toBeNull();
    expect(model.lastVersion).toBe(14);
    expect(model.table?.hand?.players[0]).toMatchObject({ stack: 970, bet: 30 });
  });

  it("ignores an intent when it is not the player's turn", () => {
    const model = run([server(raised), act("A", "call")], myTurn());
    expect(sentCommands(model)).toEqual([]);
    expect(model.pending).toBeNull();
  });

  it("keeps the raise inside the server's range", () => {
    const model = reduce(myTurn(), act("A", "raise", 5000));
    expect(sentCommands(model)[0].payload).toEqual({ kind: "raise", amount: 1000 });
  });

  it("clears the pending command and shows a notice when it is rejected", () => {
    const rejected = rejectedFixture as unknown as CommandRejectedMessage;
    const model = run([act("A", "call"), server({ ...rejected, payload: { ...rejected.payload, command_id: "A" } })], myTurn());
    expect(model.pending).toBeNull();
    expect(model.notice?.text).toMatch(/chưa tới lượt/i);
  });

  it("after a reconnect, resends the pending command with the same command_id", () => {
    const sent = run([act("A", "raise", 30), { type: "outbox.sent", count: 1, now: T0 }], myTurn());
    expect(sent.outbox).toEqual([]);
    const midHand: TableSnapshotMessage = {
      ...snapshot,
      hand_id: 41,
      version: 13,
      payload: { table: { ...snapshot.payload.table, hand: started.payload.hand, turn: deadline.payload.turn } },
    };
    const model = run([{ type: "socket.closed" }, { type: "socket.open" }, server(midHand)], sent);
    expect(sentCommands(model).map((m) => m.command_id)).toEqual(["A"]);
  });

  it("drops a pending command once its hand is gone", () => {
    const sent = run([act("A", "raise", 30), { type: "outbox.sent", count: 1, now: T0 }], myTurn());
    const model = run([{ type: "socket.closed" }, { type: "socket.open" }, server(withVersion(snapshot, 30))], sent);
    expect(model.pending).toBeNull();
    expect(sentCommands(model)).toEqual([]);
  });

  it("resends the same command when no reply came in time", () => {
    const sent = run([act("A", "raise", 30), { type: "outbox.sent", count: 1, now: T0 }], myTurn());
    expect(reduce(sent, { type: "tick", now: T0 + 1000 }).outbox).toEqual([]);
    const late = reduce(sent, { type: "tick", now: T0 + 10_000 });
    expect(sentCommands(late).map((m) => m.command_id)).toEqual(["A"]);
  });
});

describe("hand.completed", () => {
  it("shows the 7-2 moment and moves seat balances to the results", () => {
    const completed = withVersion(sevenDeuce, 14);
    const model = run([server(started), server(deadline), server(completed)], connected());
    expect(model.celebration).toMatchObject({ player_id: "1", total: 100, cards: ["7h", "2c"] });
    expect(model.table?.seats.map((s) => s.stack)).toEqual([1135, 945, 920]);
    expect(model.table?.turn).toBeNull();
    expect(reduce(model, { type: "dismiss.celebration" }).celebration).toBeNull();
  });

  it("keeps the showdown's hand names until the next hand starts", () => {
    const shown: ShowdownHand = { player_id: "2", seat: 3, category: "one_pair", cards: ["Ac", "Ad", "Qh", "Jh", "7d"] };
    const completed = withVersion({ ...sevenDeuce, payload: { ...sevenDeuce.payload, seven_deuce: null, showdown: [shown] } }, 14);
    const model = run([server(started), server(deadline), server(completed)], connected());
    expect(model.showdown).toEqual([shown]);
    const next = withVersion({ ...started, hand_id: 42 }, 15);
    expect(reduce(model, server(next)).showdown).toBeNull();
  });
});

describe("real backend messages (B4b)", () => {
  it("applies room.updated as a state event: new settings, version moves on", () => {
    const updated = {
      protocol_version: 1,
      type: "room.updated",
      room_id: snapshot.room_id,
      hand_id: null,
      version: snapshot.version + 1,
      server_time: "2026-10-27T14:03:06.000Z",
      payload: { room: { ...snapshot.payload.table.room, small_blind: 10, big_blind: 20 } },
    } as ServerMessage;
    const model = run([server(updated)], connected());
    expect(model.table?.room.big_blind).toBe(20);
    expect(model.lastVersion).toBe(snapshot.version + 1);
    expect(model.outbox.filter((m) => m.type === "resync.request")).toEqual([]);
  });

  it("shows a notice when the room is closed", () => {
    const closed = {
      protocol_version: 1,
      type: "room.updated",
      room_id: snapshot.room_id,
      hand_id: null,
      version: snapshot.version + 1,
      server_time: "2026-10-27T14:03:06.000Z",
      payload: { room: { ...snapshot.payload.table.room, status: "closed" } },
    } as ServerMessage;
    expect(run([server(closed)], connected()).notice?.text).toContain("đóng");
  });

  it("ignores chat and audience notices without touching the version", () => {
    const chat = {
      protocol_version: 1,
      type: "chat.message",
      room_id: snapshot.room_id,
      hand_id: null,
      version: snapshot.version,
      server_time: "2026-10-27T14:03:06.000Z",
      payload: { message: { message_id: 1, player_id: "2", display_name: "An", text: "gg", sent_at: "2026-10-27T14:03:06.000Z" } },
    } as ServerMessage;
    const before = connected();
    const after = run([server(chat)], before);
    expect(after.lastVersion).toBe(before.lastVersion);
    expect(after.table).toBe(before.table);
  });
});

describe("my seat", () => {
  it("follows seat.updated when I sit down and when I leave", () => {
    const watching: TableSnapshotMessage = {
      ...snapshot,
      payload: { table: { ...snapshot.payload.table, you: { player_id: "9", seat: null } } },
    };
    const occupant = { seat: 7, player_id: "9", display_name: "Khách", stack: 0, sitting_out: false, connected: true };
    const sat: ServerMessage = { ...snapshot, type: "seat.updated", hand_id: null, version: 12, payload: { seat: 7, occupant } };
    let model = run([{ type: "socket.open" }, server(watching), server(sat)]);
    expect(model.table?.you.seat).toBe(7);
    const left: ServerMessage = { ...snapshot, type: "seat.updated", hand_id: null, version: 13, payload: { seat: 7, occupant: null } };
    model = run([server(left)], model);
    expect(model.table?.you.seat).toBeNull();
  });
});

describe("one click, one command", () => {
  it("a second act before the ack resends the same command_id instead of a new command", () => {
    let model = run([server(started)], connected());
    model = reduce(model, act("first", "call"));
    model = reduce(model, act("second", "raise", 40));
    const sent = sentCommands(model);
    expect(sent).toHaveLength(2);
    expect(sent.map((m) => m.command_id)).toEqual(["first", "first"]);
    expect(sent[1]).toBe(sent[0]);
  });
});

describe("offline", () => {
  it("does not queue chat or sit-out while the socket is down (it would be dropped): says so", () => {
    const offline = reduce(connected(), { type: "socket.closed" });
    for (const action of [{ type: "chat.send", text: "gg" }, { type: "sit", out: true, commandId: "s1" }] as TableAction[]) {
      const model = reduce(offline, action);
      expect(model.outbox).toEqual([]);
      expect(model.notice?.text).toMatch(/Mất kết nối/);
    }
  });
});

describe("suspended room", () => {
  it("keeps the turn and remembers when it stopped, for the frozen clock", () => {
    const suspended: ServerMessage = {
      ...snapshot,
      type: "room.suspended",
      hand_id: 41,
      version: 14,
      payload: { reason: "recovery_needed", message: "Bàn tạm dừng" },
    };
    const model = run([server(started), server(deadline), server(suspended, T0 + 5000)], connected());
    expect(model.table?.room.status).toBe("suspended");
    expect(model.table?.turn).toEqual(deadline.payload.turn);
    expect(model.suspendedAt).toBe(T0 + 5000);
  });
});

describe("pre-action (chọn trước)", () => {
  // Lym (seat 1) raised to 30 at v14; An (seat 3) is to act, then Bình (seat 5), then Lym again.
  const hand = raised.payload.hand;
  const step = (version: number, action: Partial<AppliedAction>, patch: Partial<HandView>): ActionAppliedMessage => ({
    ...raised,
    version,
    payload: {
      action: { player_id: "2", seat: 3, kind: "call", amount: null, timeout: false, ...action } as AppliedAction,
      hand: { ...hand, ...patch },
    },
  });
  const myTurn = (legal: Partial<LegalActions>): Partial<HandView> => ({
    actor: "1",
    legal_actions: { can_fold: true, can_check: false, call_amount: 60, min_raise_to: 150, max_raise_to: 970, ...legal },
  });
  const waiting = () => run([server(started), server(deadline), server(raised)], connected());
  const choose = (kind: PreActionKind | null, model: TableModel, commandId = "pre-1") => reduce(model, { type: "pre.select", kind, commandId });

  it("Check / Bỏ folds when a bet waits at my turn: one command, with the id made when choosing", () => {
    let model = choose("check_fold", waiting());
    model = run([server(step(15, { kind: "raise", amount: 90 }, { actor: "3" })), server(step(16, { player_id: "3", seat: 5, kind: "fold" }, myTurn({})))], model);
    expect(sentCommands(model)).toHaveLength(1);
    expect(sentCommands(model)[0]).toMatchObject({ command_id: "pre-1", hand_id: hand.hand_id, payload: { kind: "fold", amount: null } });
    expect(model.preAction).toBeNull();
    // The next event of the same turn sends nothing more.
    model = reduce(model, server(withVersion(deadline, 17)));
    expect(sentCommands(model)).toHaveLength(1);
  });

  it("Check / Bỏ checks when checking is free", () => {
    const model = run([server(step(15, { kind: "call" }, { actor: "3" })), server(step(16, { player_id: "3", seat: 5, kind: "call" }, myTurn({ can_check: true, can_fold: false, call_amount: 0 })))], choose("check_fold", waiting()));
    expect(sentCommands(model).map((m) => m.payload.kind)).toEqual(["check"]);
  });

  it("Theo bất kỳ stays through a raise and calls", () => {
    const model = run([server(step(15, { kind: "raise", amount: 90 }, { actor: "3" })), server(step(16, { player_id: "3", seat: 5, kind: "fold" }, myTurn({})))], choose("call_any", waiting()));
    expect(sentCommands(model).map((m) => m.payload)).toEqual([{ kind: "call", amount: null }]);
  });

  it("Check is dropped as soon as someone raises, and nothing is sent at my turn", () => {
    let model = run([server(step(15, { kind: "raise", amount: 90 }, { actor: "3" }))], choose("check", waiting()));
    expect(model.preAction).toBeNull();
    model = reduce(model, server(step(16, { player_id: "3", seat: 5, kind: "fold" }, myTurn({}))));
    expect(sentCommands(model)).toHaveLength(0);
  });

  it("a choice no longer legal when my turn comes is dropped, not sent", () => {
    // Missed events: the resync snapshot is the first I hear of the bet.
    const model = choose("check", waiting());
    const snap = withVersion(snapshot, 20);
    const table = { ...snap.payload.table, hand: { ...hand, ...myTurn({ can_check: false }) } };
    const next = reduce(model, server({ ...snap, hand_id: hand.hand_id, payload: { table } }));
    expect(sentCommands(next)).toHaveLength(0);
    expect(next.preAction).toBeNull();
  });

  it("a reconnect whose snapshot lands on my turn sends the choice once, with its own command_id", () => {
    let model = reduce(choose("call_any", waiting(), "pre-9"), { type: "socket.closed" });
    model = reduce(model, { type: "socket.open" });
    const snap = withVersion(snapshot, 20);
    const table = { ...snap.payload.table, hand: { ...hand, ...myTurn({}) } };
    model = reduce(model, server({ ...snap, hand_id: hand.hand_id, payload: { table } }));
    expect(sentCommands(model)).toEqual([expect.objectContaining({ command_id: "pre-9", payload: { kind: "call", amount: null } })]);
    expect(model.preAction).toBeNull();
    expect(model.pending?.message.command_id).toBe("pre-9");
  });

  it("sends nothing while the room is suspended, and keeps the choice for when it resumes", () => {
    const snap = withVersion(snapshot, 20);
    const suspendedTable = { ...snap.payload.table, room: { ...snap.payload.table.room, status: "suspended" as const }, hand: { ...hand, ...myTurn({}) } };
    let model = reduce(choose("call_any", waiting()), server({ ...snap, hand_id: hand.hand_id, payload: { table: suspendedTable } }));
    expect(sentCommands(model)).toHaveLength(0);
    expect(model.preAction?.kind).toBe("call_any");
    const resumed = { ...suspendedTable, room: { ...suspendedTable.room, status: "playing" as const } };
    model = reduce(model, server({ ...withVersion(snapshot, 21), hand_id: hand.hand_id, payload: { table: resumed } }));
    expect(sentCommands(model).map((m) => m.payload.kind)).toEqual(["call"]);
  });

  it("is dropped on a new street and on a new hand", () => {
    const flop = reduce(choose("call_any", waiting()), server(step(15, { kind: "call" }, { actor: "3", board: ["Ah", "8d", "Jc"] })));
    expect(flop.preAction).toBeNull();
    const next = reduce(choose("call_any", waiting()), server(withVersion({ ...started, hand_id: 42 }, 15)));
    expect(next.preAction).toBeNull();
  });

  it("toggles off, and cannot be chosen on my own turn", () => {
    expect(choose(null, choose("check", waiting())).preAction).toBeNull();
    const mine = run([server(started)], connected()); // hand.started: Lym acts first
    expect(choose("check_fold", mine).preAction).toBeNull();
  });
});
