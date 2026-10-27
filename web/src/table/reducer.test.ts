import { describe, expect, it } from "vitest";
import type {
  ActCommandMessage,
  ActionAppliedMessage,
  CommandAckMessage,
  CommandRejectedMessage,
  HandCompletedMessage,
  HandStartedMessage,
  ServerMessage,
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
import { initialModel, reduce, type TableAction, type TableModel } from "./reducer";

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
