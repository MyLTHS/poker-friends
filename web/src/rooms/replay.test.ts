import { describe, expect, it } from "vitest";

import { describeStep, neighbours } from "./replay";

const names = { "2": "An", "3": "Bình" };

describe("describeStep", () => {
  it("says what happened at each step, in Vietnamese", () => {
    expect(describeStep(null, names)).toBe("Chia bài");
    expect(describeStep({ player_id: "2", seat: 1, kind: "fold", amount: null, timeout: false }, names)).toBe("An bỏ bài");
    expect(describeStep({ player_id: "3", seat: 4, kind: "check", amount: null, timeout: true }, names)).toBe(
      "Bình check (hết giờ)",
    );
    expect(describeStep({ player_id: "3", seat: 4, kind: "call", amount: null, timeout: false }, names)).toBe("Bình theo");
    expect(describeStep({ player_id: "2", seat: 1, kind: "raise", amount: 60, timeout: false }, names)).toBe("An tố lên 60");
  });

  it("falls back to the seat when the name is unknown", () => {
    expect(describeStep({ player_id: "9", seat: 7, kind: "fold", amount: null, timeout: false }, {})).toBe("Ghế 7 bỏ bài");
  });
});

describe("neighbours", () => {
  // GET /api/rooms/{id}/hands/ lists newest first; a voided hand cannot be replayed.
  const row = (hand_id: number, hand_no: number, voided = false) => ({ hand_id, hand_no, voided });
  const hands = [row(14, 5), row(13, 4, true), row(12, 3), row(11, 2), row(10, 1)];

  it("the hand before is older, the hand after is newer, skipping voided hands", () => {
    expect(neighbours(hands, 12)).toEqual({ prev: row(11, 2), next: row(14, 5) });
  });

  it("has nothing past either end", () => {
    expect(neighbours(hands, 10)).toEqual({ prev: null, next: row(11, 2) });
    expect(neighbours(hands, 14)).toEqual({ prev: row(12, 3), next: null });
  });

  it("has nothing when the hand is not in the list", () => {
    expect(neighbours(hands, 99)).toEqual({ prev: null, next: null });
    expect(neighbours([], 12)).toEqual({ prev: null, next: null });
  });
});
