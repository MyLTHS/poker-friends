import { describe, expect, it } from "vitest";

import { ringFor } from "./TableFx";

describe("the ring an action makes", () => {
  it("knocks for a check, rings for a bet or a raise, and nothing for a call or a fold", () => {
    expect(ringFor("check", 0, 30)).toBe("knock");
    expect(ringFor("bet", 10, 30)).toBe("bet");
    expect(ringFor("raise", 20, 30)).toBe("raise");
    expect(ringFor("call", 10, 30)).toBeNull();
    expect(ringFor("fold", 0, 30)).toBeNull();
    expect(ringFor("allin", 990, 30)).toBeNull(); // the all-in stamp has its own shock ring
  });

  it("doubles up for a pot-sized bet or more", () => {
    expect(ringFor("bet", 30, 30)).toBe("big");
    expect(ringFor("raise", 90, 30)).toBe("big");
    expect(ringFor("bet", 10, 0)).toBe("bet");
  });
});
