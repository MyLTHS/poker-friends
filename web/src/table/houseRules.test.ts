import { describe, expect, it } from "vitest";

import { bombPotHand, isBombPot, stakesText } from "./houseRules";

const room = { small_blind: 10, big_blind: 20, ante: 0, bomb_pot_every: 0, bomb_pot_amount: 0 };

describe("house rules on the table", () => {
  it("shows the ante beside the blinds only when there is one", () => {
    expect(stakesText(room)).toBe("Blind 10/20");
    expect(stakesText({ ...room, ante: 5 })).toBe("Blind 10/20 · Ante 5");
    expect(stakesText({ ...room, small_blind: 500, big_blind: 1000, ante: 1500 })).toBe("Blind 500/1.000 · Ante 1.500");
  });

  it("knows a bomb pot hand from the hand itself", () => {
    expect(isBombPot({ bomb_pot: 40 })).toBe(true);
    expect(isBombPot({ bomb_pot: 0 })).toBe(false);
    expect(isBombPot(null)).toBe(false);
  });

  it("works out which hand numbers are bomb pots, like the server (every Nth, N, 2N, 3N…)", () => {
    const every3 = { ...room, bomb_pot_every: 3, bomb_pot_amount: 40 };
    expect([1, 2, 3, 4, 5, 6].map((n) => bombPotHand(every3, n))).toEqual([false, false, true, false, false, true]);
    expect(bombPotHand({ ...room, bomb_pot_every: 1, bomb_pot_amount: 40 }, 7)).toBe(true);
    expect(bombPotHand(room, 3)).toBe(false); // off
    expect(bombPotHand({ ...room, bomb_pot_every: 3, bomb_pot_amount: 0 }, 3)).toBe(false); // no amount: the server deals a normal hand
  });
});
