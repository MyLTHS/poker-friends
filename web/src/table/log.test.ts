import { describe, expect, it } from "vitest";

import type { HandCompletedMessage, HandView, TableSnapshotMessage, TableState } from "@/api/protocol";
import showdownFixture from "../../../docs/api/fixtures/server/valid/hand.completed.showdown.json";
import sevenDeuceFixture from "../../../docs/api/fixtures/server/valid/hand.completed.seven-deuce.json";
import midHandFixture from "../../../docs/api/fixtures/server/valid/table.snapshot.mid-hand.json";

import { logFor } from "./log";

const midHand = (midHandFixture as unknown as TableSnapshotMessage).payload.table;
const showdown = showdownFixture as unknown as HandCompletedMessage;
const sevenDeuce = sevenDeuceFixture as unknown as HandCompletedMessage;

describe("logFor hand.completed", () => {
  // Before the showdown: seats 1 and 3 still hold face-down cards on a full board.
  const hand = showdown.payload.hand;
  const before: TableState = {
    ...midHand,
    hand: { ...hand, complete: false, players: hand.players.map((p) => ({ ...p, in_hand: true, cards: ["??", "??"] })) as HandView["players"] },
  };

  it("logs each shown hand with its name, and who mucked", () => {
    const entries = logFor(before, showdown);
    expect(entries).toContainEqual({ kind: "show", seat: 3, cards: ["Ac", "Ad"], hand: "Đôi A" });
    expect(entries).toContainEqual({ kind: "muck", seat: 1 });
    expect(entries.findIndex((e) => e.kind === "show")).toBeLessThan(entries.findIndex((e) => e.kind === "win"));
  });

  it("a 7-2 bluff shows the cards without a hand name and nobody mucks", () => {
    const entries = logFor(midHand, sevenDeuce);
    expect(entries).toContainEqual({ kind: "show", seat: 1, cards: ["7h", "2c"] });
    expect(entries.some((e) => e.kind === "muck")).toBe(false);
  });
});
