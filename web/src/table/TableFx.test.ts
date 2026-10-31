import { describe, expect, it } from "vitest";

import { ringFor } from "./TableFx";

describe("the ring an action makes", () => {
  it("knocks for a check, rings for a bet or a raise, and nothing for a call or a fold", () => {
    expect(ringFor("check", 0, 0, 30)).toBe("knock");
    expect(ringFor("bet", 10, 0, 30)).toBe("bet");
    expect(ringFor("raise", 40, 20, 50)).toBe("raise");
    expect(ringFor("call", 10, 10, 30)).toBeNull();
    expect(ringFor("fold", 0, 0, 30)).toBeNull();
  });

  it("doubles up for a pot-sized bet or raise, and for every all-in", () => {
    expect(ringFor("bet", 30, 0, 30)).toBe("big");
    // blinds 5/10: a min-raise to 20 is no pot raise; a pot raise is to 45 (10 to call + 35)
    expect(ringFor("raise", 20, 10, 15)).toBe("raise");
    expect(ringFor("raise", 45, 10, 15)).toBe("big");
    expect(ringFor("allin", 990, 0, 30)).toBe("big");
  });
});
