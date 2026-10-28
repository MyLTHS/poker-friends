import { describe, expect, it } from "vitest";

import { cardName, fmt, isRed, parseCard, signed, tone } from "./format";

describe("fmt", () => {
  it("groups thousands with a dot, the Vietnamese way", () => {
    expect(fmt(1460)).toBe("1.460");
    expect(fmt(1234567)).toBe("1.234.567");
    expect(fmt(999)).toBe("999");
    expect(fmt(0)).toBe("0");
  });

  it("drops the sign and any fraction (signed() adds the sign)", () => {
    expect(fmt(-1460)).toBe("1.460");
    expect(fmt(12.9)).toBe("12");
  });
});

describe("signed", () => {
  it("puts a plus on gains and a real minus sign (U+2212) on losses", () => {
    expect(signed(1130)).toBe("+1.130");
    expect(signed(-540)).toBe("−540");
    expect(signed(-540)).not.toContain("-"); // not the hyphen-minus from the keyboard
    expect(signed(0)).toBe("0");
  });
});

describe("tone", () => {
  it("names the colour role of a figure", () => {
    expect(tone(5)).toBe("gain");
    expect(tone(-5)).toBe("loss");
    expect(tone(0)).toBe("even");
  });
});

describe("parseCard", () => {
  it("reads protocol cards into rank and suit", () => {
    expect(parseCard("As")).toEqual({ rank: "A", suit: "♠" });
    expect(parseCard("7c")).toEqual({ rank: "7", suit: "♣" });
    expect(parseCard("Qd")).toEqual({ rank: "Q", suit: "♦" });
  });

  it("writes the ten as 10", () => {
    expect(parseCard("Th")).toEqual({ rank: "10", suit: "♥" });
  });

  it("gives null for a hidden card and for anything malformed", () => {
    expect(parseCard("??")).toBeNull();
    expect(parseCard("Ax")).toBeNull();
    expect(parseCard("A")).toBeNull();
    expect(parseCard("10h")).toBeNull();
    expect(parseCard("")).toBeNull();
  });
});

describe("isRed", () => {
  it("is true for hearts and diamonds only", () => {
    expect(isRed({ rank: "A", suit: "♥" })).toBe(true);
    expect(isRed({ rank: "A", suit: "♦" })).toBe(true);
    expect(isRed({ rank: "A", suit: "♠" })).toBe(false);
    expect(isRed({ rank: "A", suit: "♣" })).toBe(false);
  });
});

describe("cardName", () => {
  it("reads a card aloud in Vietnamese", () => {
    expect(cardName({ rank: "A", suit: "♥" })).toBe("A cơ");
    expect(cardName({ rank: "10", suit: "♠" })).toBe("10 bích");
    expect(cardName(parseCard("Kd"))).toBe("K rô");
    expect(cardName(parseCard("2c"))).toBe("2 chuồn");
  });

  it("reads a hidden card as face down", () => {
    expect(cardName(null)).toBe("Bài úp");
    expect(cardName(parseCard("??"))).toBe("Bài úp");
  });
});
