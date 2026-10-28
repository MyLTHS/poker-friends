import { describe, expect, it } from "vitest";

import { describeStep } from "./replay";

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
