// The room rules that act once a hand is over: run it twice (two boards, half of every pot each),
// rabbit hunt (the board cards that would have come) and "Ngửa bài" (command.show_cards /
// cards.shown). Reducer, table view and log, from the docs/api fixtures.
import { describe, expect, it } from "vitest";

import type {
  CardsShownMessage,
  CommandAckMessage,
  CommandRejectedMessage,
  HandCompletedMessage,
  HandStartedMessage,
  ServerMessage,
  ShowCardsCommandMessage,
  ShowdownHand,
  TableSnapshotMessage,
  TurnDeadlineMessage,
} from "@/api/protocol";
import shownFixture from "../../../docs/api/fixtures/server/valid/cards.shown.json";
import sevenDeuceFixture from "../../../docs/api/fixtures/server/valid/hand.completed.seven-deuce.json";
import snapshotFixture from "../../../docs/api/fixtures/server/valid/table.snapshot.between-hands.json";
import startedFixture from "../../../docs/api/fixtures/server/valid/hand.started.json";
import deadlineFixture from "../../../docs/api/fixtures/server/valid/turn.deadline.json";

import { runoutLines, showdownBySeat } from "./handName";
import { logFor } from "./log";
import { canShowCards, initialModel, reduce, shownHands, type TableAction, type TableModel } from "./reducer";
import { tableView } from "./seatView";

// Lym (player 1, seat 1) with An (2, seat 3) and Bình (3, seat 5): hand 41, snapshot v11.
const snapshot = snapshotFixture as unknown as TableSnapshotMessage;
const started = startedFixture as unknown as HandStartedMessage;
const deadline = deadlineFixture as unknown as TurnDeadlineMessage;
const sevenDeuce = sevenDeuceFixture as unknown as HandCompletedMessage;
const shownByAn = shownFixture as unknown as CardsShownMessage;

const T0 = Date.parse("2026-10-27T14:03:05.120Z");
const server = (message: ServerMessage): TableAction => ({ type: "server", message, receivedAt: T0 });
const run = (actions: TableAction[], model: TableModel = initialModel()) => actions.reduce(reduce, model);
const live = () => run([{ type: "socket.open" }, server(snapshot), server(started), server(deadline)]);

/** Lym wins hand 41 on the flop because everyone folds; no 7-2 bonus. Rabbit: Td 6c. */
const foldWin: HandCompletedMessage = { ...sevenDeuce, version: 14, payload: { ...sevenDeuce.payload, seven_deuce: null } };
const afterFoldWin = () => run([server(foldWin)], live());

/** Lym (7h 2c) and An (Kd Qs) all in preflop, run twice: Lym wins board 1, An board 2. */
function runTwice(): HandCompletedMessage {
  const hand = sevenDeuce.payload.hand;
  const board1 = ["Ah", "7d", "7c", "3s", "9h"];
  const board2 = ["Kh", "8d", "4c", "2s", "Jd"];
  const showdown: ShowdownHand[] = [
    { player_id: "1", seat: 1, board: 1, category: "three_of_a_kind", cards: ["7h", "7d", "7c", "Ah", "9h"] },
    { player_id: "2", seat: 3, board: 1, category: "high_card", cards: ["Ah", "Kd", "Qs", "9h", "7d"] },
    { player_id: "1", seat: 1, board: 2, category: "one_pair", cards: ["2c", "2s", "Kh", "Jd", "8d"] },
    { player_id: "2", seat: 3, board: 2, category: "one_pair", cards: ["Kd", "Kh", "Qs", "Jd", "8d"] },
  ];
  return {
    ...sevenDeuce,
    version: 14,
    payload: {
      hand: {
        ...hand,
        board: board1 as never,
        second_board: board2 as never,
        players: [
          { player_id: "1", seat: 1, stack: 1000, bet: 0, in_hand: true, cards: ["7h", "2c"] },
          { player_id: "2", seat: 3, stack: 1000, bet: 0, in_hand: true, cards: ["Kd", "Qs"] },
          { player_id: "3", seat: 5, stack: 990, bet: 0, in_hand: false, cards: [] },
        ] as never,
      },
      results: [
        { player_id: "1", seat: 1, hand_net: 5, seven_deuce_net: 0, stack: 1005 },
        { player_id: "2", seat: 3, hand_net: -5, seven_deuce_net: 0, stack: 995 },
        { player_id: "3", seat: 5, hand_net: 0, seven_deuce_net: 0, stack: 990 },
      ] as never,
      seven_deuce: null,
      showdown,
      runouts: [
        { board: board1 as never, winners: [{ player_id: "1", seat: 1, amount: 1005 }] },
        { board: board2 as never, winners: [{ player_id: "2", seat: 3, amount: 1000 }] },
      ],
      rabbit_cards: [],
    },
  };
}

describe("run it twice", () => {
  it("keeps both boards and what each paid, until the next hand", () => {
    const model = run([server(runTwice())], live());
    expect(model.table?.hand?.second_board).toEqual(["Kh", "8d", "4c", "2s", "Jd"]);
    expect(model.runouts?.map((r) => r.winners.map((w) => w.amount))).toEqual([[1005], [1000]]);
    const next = reduce(model, server({ ...started, hand_id: 42, version: 15 }));
    expect(next.runouts).toBeNull();
  });

  it("draws two boards, each lit by the hand of whoever it paid, with its winners", () => {
    const model = run([server(runTwice())], live());
    const view = tableView(model.table!, { results: model.results, showdown: model.showdown, runouts: model.runouts });
    expect(view.runouts).toHaveLength(2);
    expect(view.runouts![0]).toMatchObject({ cards: ["Ah", "7d", "7c", "3s", "9h"], winners: [{ name: "Lym", amount: 1005 }] });
    // board 1: Lym's trip sevens (Ah 7d 7c 9h), not An's high card; board 2: An's kings
    expect(view.runouts![0].hi).toEqual([0, 1, 2, 4]);
    expect(view.runouts![1]).toMatchObject({ winners: [{ name: "An", amount: 1000 }] });
    expect(view.runouts![1].hi).toEqual([0, 1, 4]);
    expect(view.boardHi).toEqual(view.runouts![0].hi);
    // a seat names its hand on each board
    expect(view.seats.find((s) => s.seat === 3)?.hand).toBe("Mậu thầu A / Đôi K");
    expect(view.rabbit).toEqual([]);
  });

  it("names the hand's winner on both boards when the server leaves a scooped board's winners out", () => {
    // one player took both boards, the other mucked: the engine pays it as an uncontested pot
    const scoop = runTwice();
    scoop.payload.runouts = scoop.payload.runouts!.map((r) => ({ ...r, winners: [] })) as never;
    scoop.payload.showdown = scoop.payload.showdown.filter((h) => h.seat === 1);
    const model = run([server(scoop)], live());
    const view = tableView(model.table!, { results: model.results, showdown: model.showdown, runouts: model.runouts });
    expect(view.runouts!.map((r) => r.winners)).toEqual([[{ name: "Lym" }], [{ name: "Lym" }]]);
    expect(view.runouts![0].hi).toEqual([0, 1, 2, 4]);
    expect(logFor(live().table!, scoop).filter((e) => e.kind === "runout").map((e) => e.kind === "runout" && e.winners)).toEqual([[{ seat: 1 }], [{ seat: 1 }]]);
  });

  it("shows no second board while the hand is running, nor for a normal hand", () => {
    const model = live();
    expect(tableView(model.table!).runouts).toBeNull();
    expect(tableView(afterFoldWin().table!).runouts).toBeNull();
  });

  it("logs 'Chạy 2 lần' with each board and who it paid, not the streets", () => {
    const model = live();
    const entries = logFor(model.table!, runTwice());
    expect(entries.filter((e) => e.kind === "street")).toEqual([]);
    expect(entries.filter((e) => e.kind === "runout")).toEqual([
      { kind: "runout", n: 1, cards: ["Ah", "7d", "7c", "3s", "9h"], winners: [{ seat: 1, amount: 1005 }] },
      { kind: "runout", n: 2, cards: ["Kh", "8d", "4c", "2s", "Jd"], winners: [{ seat: 3, amount: 1000 }] },
    ]);
    // each shown hand once, named per board
    expect(entries.filter((e) => e.kind === "show")).toEqual([
      { kind: "show", seat: 1, cards: ["7h", "2c"], hand: "Bộ ba 7 / Đôi 2" },
      { kind: "show", seat: 3, cards: ["Kd", "Qs"], hand: "Mậu thầu A / Đôi K" },
    ]);
  });

  it("words the result per board", () => {
    expect(runoutLines([{ winners: [{ name: "Lym", amount: 1005 }] }, { winners: [{ name: "An", amount: 500 }, { name: "Bình", amount: 500 }] }])).toEqual({
      title: "Chạy 2 lần",
      detail: "Lần 1: Lym +1.005 · Lần 2: An +500, Bình +500",
    });
    expect(runoutLines([{ winners: [{ name: "Lym", amount: 1000 }] }, { winners: [{ name: "Lym", amount: 1000 }] }]).detail).toBe("Lym thắng cả 2 lần (lần 1 +1.000, lần 2 +1.000)");
    expect(runoutLines([{ winners: [{ name: "Lym" }] }, { winners: [{ name: "Lym" }] }]).detail).toBe("Lym thắng cả 2 lần");
    expect(showdownBySeat([{ player_id: "1", seat: 1, board: 1, category: "flush", cards: ["Ah", "9h", "7h", "5h", "2h"] }, { player_id: "1", seat: 1, board: 2, category: "flush", cards: ["Ah", "9h", "7h", "5h", "2h"] }])).toEqual({ 1: "Thùng già A" });
  });
});

describe("rabbit hunt", () => {
  it("keeps the cards that would have come and fills the empty board slots with them", () => {
    const model = afterFoldWin();
    expect(model.rabbit).toEqual(["Td", "6c"]);
    const view = tableView(model.table!, { results: model.results, rabbit: model.rabbit });
    expect(view.board).toEqual(["Ah", "8d", "Jc"]);
    expect(view.rabbit).toEqual(["Td", "6c"]);
  });

  it("logs them, and forgets them when the next hand starts", () => {
    expect(logFor(live().table!, foldWin).at(-1)).toEqual({ kind: "rabbit", cards: ["Td", "6c"] });
    const next = reduce(afterFoldWin(), server({ ...started, hand_id: 42, version: 15 }));
    expect(next.rabbit).toEqual([]);
    expect(tableView(next.table!, { rabbit: ["Td", "6c"] }).rabbit).toEqual([]); // only for a hand over
  });
});

describe("showing cards after the hand", () => {
  const ack = (commandId: string): CommandAckMessage => ({
    protocol_version: 1,
    type: "command.ack",
    room_id: 1,
    hand_id: 41,
    version: 14,
    server_time: "2026-10-27T14:03:53.000Z",
    payload: { command_id: commandId, result_version: 14, duplicate: false },
  });
  const rejected = (commandId: string, code: CommandRejectedMessage["payload"]["code"]): CommandRejectedMessage => ({
    protocol_version: 1,
    type: "command.rejected",
    room_id: 1,
    hand_id: 41,
    version: 14,
    server_time: "2026-10-27T14:03:53.000Z",
    payload: { command_id: commandId, code, message: "" },
  });
  const shownByMe: CardsShownMessage = { ...shownByAn, payload: { player_id: "1", seat: 1, cards: ["7h", "2c"] } };

  it("offers 'Ngửa bài' only once the hand is over, to a player dealt in whose cards are face down", () => {
    expect(canShowCards(live())).toBe(false); // still running
    expect(canShowCards(afterFoldWin())).toBe(true); // won by folds, nothing turned over
    // a 7-2 win turns the cards over for everyone: nothing left to show
    expect(canShowCards(run([server({ ...sevenDeuce, version: 14 })], live()))).toBe(false);
    // folded players may show too (An folded hand 41); a spectator may not
    const asAn = run([server(foldWin)], run([{ type: "socket.open" }, server({ ...snapshot, payload: { table: { ...snapshot.payload.table, you: { player_id: "2", seat: 3 } } } }), server(started), server(deadline)]));
    expect(canShowCards(asAn)).toBe(true);
    const watcher = run([server(foldWin)], run([{ type: "socket.open" }, server({ ...snapshot, payload: { table: { ...snapshot.payload.table, you: { player_id: "9", seat: null } } } }), server(started), server(deadline)]));
    expect(canShowCards(watcher)).toBe(false);
  });

  it("sends command.show_cards for the finished hand, once, and hides the button while it goes", () => {
    const model = reduce(afterFoldWin(), { type: "show", commandId: "S1" });
    const sent = model.outbox.filter((m): m is ShowCardsCommandMessage => m.type === "command.show_cards");
    expect(sent).toEqual([{ protocol_version: 1, type: "command.show_cards", room_id: 1, hand_id: 41, command_id: "S1", payload: {} }]);
    expect(model.showing).toEqual({ commandId: "S1", handId: 41 });
    expect(canShowCards(model)).toBe(false);
    expect(reduce(model, { type: "show", commandId: "S2" }).outbox).toHaveLength(1);
    // the ack alone changes nothing; cards.shown for me ends it
    const acked = reduce(model, server(ack("S1")));
    expect(acked.showing).not.toBeNull();
    const shown = reduce(acked, server(shownByMe));
    expect(shown.showing).toBeNull();
    expect(canShowCards(shown)).toBe(false);
  });

  it("does nothing while the hand runs, and says so when offline", () => {
    expect(reduce(live(), { type: "show", commandId: "S1" }).outbox).toEqual([]);
    const offline = reduce(afterFoldWin(), { type: "socket.closed" });
    const tried = reduce(offline, { type: "show", commandId: "S1" });
    expect(tried.outbox).toEqual([]);
    expect(tried.notice?.text).toMatch(/Mất kết nối/);
  });

  it("puts each refusal in words and offers the button again", () => {
    const texts: Record<string, string> = {
      hand_in_progress: "Ván chưa xong, đợi xong ván rồi hãy ngửa bài.",
      not_in_hand: "Bạn không được chia bài ở ván đó.",
      already_shown: "Cả bàn đã thấy bài của bạn rồi.",
      stale_hand: "Ván mới đã bắt đầu, không ngửa bài ván trước được nữa.",
    };
    for (const [code, text] of Object.entries(texts)) {
      const model = run([{ type: "show", commandId: "S1" }, server(rejected("S1", code as never))], afterFoldWin());
      expect(model.notice?.text).toBe(text);
      expect(model.showing).toBeNull();
    }
    // someone else's refusal is not mine
    const other = run([{ type: "show", commandId: "S1" }, server(rejected("X", "already_shown"))], afterFoldWin());
    expect(other.showing).not.toBeNull();
    expect(other.notice).toBeNull();
  });

  it("turns the shower's cards face up for everyone and logs 'X ngửa bài', until the next hand", () => {
    const model = reduce(afterFoldWin(), server(shownByAn));
    expect(shownHands(model)).toEqual([{ player_id: "2", seat: 3, cards: ["Kd", "Qs"] }]);
    expect(model.log.at(-1)).toEqual({ kind: "reveal", seat: 3, cards: ["Kd", "Qs"] });
    expect(model.lastVersion).toBe(14); // a notice: no version
    const view = tableView(model.table!, { results: model.results, shown: shownHands(model) });
    expect(view.seats.find((s) => s.seat === 3)).toMatchObject({ cards: ["Kd", "Qs"], shown: true, state: "folded" });
    // the same notice twice changes nothing
    const again = reduce(model, server(shownByAn));
    expect(again.shown).toBe(model.shown);
    expect(again.log).toBe(model.log);
    const next = reduce(model, server({ ...started, hand_id: 42, version: 15 }));
    expect(shownHands(next)).toEqual([]);
    expect(tableView(next.table!, { shown: shownHands(next) }).seats.find((s) => s.seat === 3)?.shown).toBe(false);
  });

  it("counts the showdown's and the 7-2's face-up cards as shown already", () => {
    const seven = run([server({ ...sevenDeuce, version: 14 })], live());
    expect(shownHands(seven)).toEqual([{ player_id: "1", seat: 1, cards: ["7h", "2c"] }]);
    const twice = run([server(runTwice())], live());
    expect(shownHands(twice).map((h) => h.seat)).toEqual([1, 3]);
    expect(canShowCards(twice)).toBe(false);
  });
});
