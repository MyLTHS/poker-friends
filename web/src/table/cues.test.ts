import { describe, expect, it } from "vitest";

import type {
  ActionAppliedMessage,
  ChatMessageMessage,
  HandCompletedMessage,
  HandStartedMessage,
  ServerMessage,
  TableSnapshotMessage,
  TurnDeadlineMessage,
} from "@/api/protocol";
import chatFixture from "../../../docs/api/fixtures/server/valid/chat.message.json";
import raiseFixture from "../../../docs/api/fixtures/server/valid/action.applied.raise.json";
import sevenDeuceFixture from "../../../docs/api/fixtures/server/valid/hand.completed.seven-deuce.json";
import snapshotFixture from "../../../docs/api/fixtures/server/valid/table.snapshot.between-hands.json";
import startedFixture from "../../../docs/api/fixtures/server/valid/hand.started.json";
import deadlineFixture from "../../../docs/api/fixtures/server/valid/turn.deadline.json";

import { initialModel, reduce, type TableAction, type TableModel } from "./reducer";

// docs/api fixtures: snapshot v11, hand.started v12, turn v13, raise v14 (Lym, seat 1).
const snapshot = snapshotFixture as unknown as TableSnapshotMessage;
const started = startedFixture as unknown as HandStartedMessage;
const deadline = deadlineFixture as unknown as TurnDeadlineMessage;
const raised = raiseFixture as unknown as ActionAppliedMessage;
const sevenDeuce = sevenDeuceFixture as unknown as HandCompletedMessage;
const chat = chatFixture as unknown as ChatMessageMessage;

const server = (message: ServerMessage): TableAction => ({ type: "server", message, receivedAt: Date.parse(message.server_time) });
const run = (actions: TableAction[], model: TableModel = initialModel()) => actions.reduce(reduce, model);
const connected = () => run([{ type: "socket.open" }, server(snapshot)]);
const v = <M extends ServerMessage>(m: M, version: number): M => ({ ...m, version });
const kinds = (model: TableModel) => model.fx.map((c) => c.kind);

const hand = started.payload.hand;
/** An action that closes the preflop round: everyone called 10, the flop comes. */
const flop: ActionAppliedMessage = {
  ...raised,
  version: 14,
  payload: {
    action: { player_id: "3", seat: 5, kind: "check", amount: null, timeout: false },
    hand: {
      ...hand,
      board: ["Ah", "8d", "Jc"],
      pots: [{ amount: 30, eligible: ["1", "2", "3"] }],
      players: [
        { ...hand.players[0], stack: 990, bet: 0 },
        { ...hand.players[1], stack: 990, bet: 0 },
        { ...hand.players[2], stack: 990, bet: 0 },
      ],
      actor: "2",
      legal_actions: null,
    },
  },
};
const called: ActionAppliedMessage = {
  ...raised,
  version: 14,
  payload: {
    action: { player_id: "1", seat: 1, kind: "call", amount: null, timeout: false },
    hand: { ...hand, players: [{ ...hand.players[0], stack: 990, bet: 10 }, hand.players[1], hand.players[2]], actor: "2", legal_actions: null },
  },
};

describe("animation cues", () => {
  it("a snapshot never animates anything", () => {
    const model = connected();
    expect(model.fx).toEqual([]);
    expect(model.fxEpoch).toBe(1);
  });

  it("hand.started deals round-robin from the small blind", () => {
    const model = run([server(started)], connected());
    expect(model.fx).toEqual([{ id: 1, kind: "deal", order: [3, 5, 1] }]);
  });

  it("a call slides the bet out; turn.deadline and chat add no cue", () => {
    const model = run([server(started), server(deadline), server(called), server(v(chat, 14))], connected());
    expect(kinds(model)).toEqual(["deal", "bet"]);
    expect(model.fx.at(-1)).toMatchObject({ kind: "bet", seat: 1 });
  });

  it("the end of a round gathers the bets as they stood, then deals the flop", () => {
    const model = run([server(started), server(deadline), server(flop)], connected());
    expect(model.fx.slice(1)).toMatchObject([
      { kind: "collect", bets: [{ seat: 3, amount: 5 }, { seat: 5, amount: 10 }] },
      { kind: "board", from: 0, to: 3 },
    ]);
  });

  it("the 7-2 win pays the pot to the winner and plays the moment", () => {
    const model = run([server(started), server(deadline), server(raised), server(v(sevenDeuce, 15))], connected());
    const last = model.fx.filter((c) => c.id > 1);
    expect(last.map((c) => c.kind)).toEqual(["bet", "collect", "board", "award", "seven"]);
    expect(model.celebration?.seat).toBe(1);
    expect(model.celebrationQuiet).toBe(false);
  });

  it("events kept while waiting for a resync snapshot are applied quietly", () => {
    // v14 arrives after a gap: resync requested, v15 buffered, then the snapshot at v13 replays them.
    let model = run([server(started)], connected());
    model = run([server(v(sevenDeuce, 15))], model);
    expect(model.awaitingSnapshot).toBe(true);
    const fxBefore = model.fx.length;
    const midSnapshot: TableSnapshotMessage = { ...snapshot, version: 14, payload: { table: { ...snapshot.payload.table, hand: raised.payload.hand } } };
    model = run([server(midSnapshot)], model);
    expect(model.table?.hand?.complete).toBe(true);
    expect(model.fx.length).toBe(fxBefore);
    expect(model.celebration).not.toBeNull();
    expect(model.celebrationQuiet).toBe(true);
    expect(model.fxEpoch).toBe(2);
  });

  it("a new hand clears the labels and the last celebration", () => {
    let model = run([server(started), server(deadline), server(raised), server(v(sevenDeuce, 15))], connected());
    expect(model.lastActions[1]).toMatchObject({ kind: "raise" });
    model = run([server(v(started, 16))], model);
    expect(model.lastActions).toEqual({});
    expect(model.celebration).toBeNull();
  });

  it("keeps a bounded number of cues", () => {
    let model = connected();
    for (let i = 0; i < 20; i++) model = run([server(v(started, 12 + i))], model);
    expect(model.fx.length).toBeLessThanOrEqual(12);
    expect(model.fx.at(-1)!.id).toBe(20);
  });
});

describe("chat and log on the table socket", () => {
  it("keeps chat lines and spectators, and sends chat through the outbox", () => {
    let model = run([server(v(chat, 11))], connected());
    expect(model.chat).toHaveLength(1);
    model = reduce(model, { type: "chat.send", text: "  gg  " });
    expect(model.outbox.at(-1)).toMatchObject({ type: "chat.send", room_id: 1, payload: { text: "gg" } });
    expect(reduce(model, { type: "chat.send", text: "   " }).outbox).toHaveLength(model.outbox.length);
  });

  it("sends sit out / sit in", () => {
    const model = reduce(connected(), { type: "sit", out: true, commandId: "c1" });
    expect(model.outbox.at(-1)).toMatchObject({ type: "command.sit_out", command_id: "c1" });
  });

  it("logs the hand from the events it saw", () => {
    const model = run([server(started), server(deadline), server(flop)], connected());
    expect(model.log.map((e) => e.kind)).toEqual(["hand", "action", "street"]);
  });
});
