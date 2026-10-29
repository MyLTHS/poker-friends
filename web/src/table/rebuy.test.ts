import { describe, expect, it } from "vitest";

import type { TableSnapshotMessage, TableState } from "@/api/protocol";
import betweenFixture from "../../../docs/api/fixtures/server/valid/table.snapshot.between-hands.json";
import midHandFixture from "../../../docs/api/fixtures/server/valid/table.snapshot.mid-hand.json";

import { noChipsText, offersRebuy } from "./rebuy";

const between = (betweenFixture as unknown as TableSnapshotMessage).payload.table;
const midHand = (midHandFixture as unknown as TableSnapshotMessage).payload.table;
const withStatus = (t: TableState, status: TableState["room"]["status"]): TableState => ({ ...t, room: { ...t.room, status } });

describe("Mua thêm", () => {
  it("is offered to a seated player with no chips between hands, owner or not", () => {
    expect(offersRebuy(between, 0)).toBe(true);
    expect(offersRebuy(between, 120)).toBe(false); // still has chips
    expect(offersRebuy(between, undefined)).toBe(false); // not seated
  });

  it("waits while my all-in is still being played; a hand I am out of does not count", () => {
    expect(offersRebuy(midHand, 0)).toBe(false); // player 3 is in the running hand
    const folded: TableState = { ...midHand, you: { ...midHand.you, player_id: "2" } };
    expect(offersRebuy(folded, 0)).toBe(true);
    const done: TableState = { ...midHand, hand: midHand.hand && { ...midHand.hand, complete: true } };
    expect(offersRebuy(done, 0)).toBe(true); // lost it all in the hand still on screen
  });

  it("is not offered once the room is closed", () => {
    expect(offersRebuy(withStatus(between, "closed"), 0)).toBe(false);
  });

  it("the idle bar points at the button, never at the owner", () => {
    expect(noChipsText(true)).toBe("Hết chip — bấm Mua thêm");
    expect(noChipsText(false)).toBe("Hết chip");
    expect(noChipsText(true)).not.toMatch(/chủ phòng/);
  });
});
