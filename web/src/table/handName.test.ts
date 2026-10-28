import { describe, expect, it } from "vitest";

import type { HandCategory, ShowdownHand } from "@/api/protocol";

import { boardHighlights, handName, showdownBySeat, winnerLines } from "./handName";

const entry = (category: HandCategory, cards: string[], seat = 1): ShowdownHand =>
  ({ player_id: String(seat), seat, category, cards }) as ShowdownHand;

describe("handName", () => {
  it.each<[HandCategory, string[], string]>([
    ["high_card", ["Ah", "Kd", "9h", "7s", "4h"], "Mậu thầu A"],
    ["one_pair", ["Ac", "Ad", "Qh", "Jh", "7d"], "Đôi A"],
    ["two_pair", ["Kc", "Kd", "9h", "9s", "2c"], "Hai đôi K và 9"],
    ["three_of_a_kind", ["Ks", "Kd", "Kh", "9h", "4h"], "Bộ ba K"],
    ["straight", ["Ts", "9d", "8h", "7h", "6c"], "Sảnh tới 10"],
    ["straight", ["5h", "4d", "3s", "2c", "Ah"], "Sảnh tới 5"],
    ["flush", ["Ah", "Kh", "9h", "7h", "4h"], "Thùng già A"],
    ["full_house", ["7h", "7d", "7c", "2h", "2s"], "Cù lũ 7 đôi 2"],
    ["four_of_a_kind", ["Qs", "Qd", "Qh", "Qc", "4h"], "Tứ quý Q"],
    ["straight_flush", ["9h", "8h", "7h", "6h", "5h"], "Thùng phá sảnh tới 9"],
    ["straight_flush", ["Ah", "Kh", "Qh", "Jh", "Th"], "Thùng phá sảnh lớn"],
  ])("names %s %j as the design writes it", (category, cards, name) => {
    expect(handName(entry(category, cards))).toBe(name);
  });
});

describe("boardHighlights", () => {
  it("lights the board cards used by the shown hands", () => {
    const board = ["9h", "4h", "Kh", "2c", "7h"];
    expect(boardHighlights([entry("flush", ["Ah", "Kh", "9h", "7h", "5h"])], board)).toEqual([0, 2, 4]);
  });

  it("joins the cards of every hand of a split pot", () => {
    const board = ["9h", "4d", "3h", "2c", "7s"];
    const hands = [entry("high_card", ["Ah", "Kd", "9h", "7s", "4d"], 1), entry("high_card", ["Ac", "Ks", "9h", "7s", "4d"], 2)];
    expect(boardHighlights(hands, board)).toEqual([0, 1, 4]);
  });

  it("lights nothing without a showdown", () => {
    expect(boardHighlights([], ["9h", "4d", "3h"])).toEqual([]);
    expect(boardHighlights(null, ["9h", "4d", "3h"])).toEqual([]);
  });
});

describe("showdownBySeat", () => {
  it("maps each seat to the name of its hand", () => {
    const names = showdownBySeat([entry("one_pair", ["Ac", "Ad", "Qh", "Jh", "7d"], 3)]);
    expect(names).toEqual({ 3: "Đôi A" });
  });
});

describe("winnerLines", () => {
  it("one winner: the amount, then the hand", () => {
    expect(winnerLines([{ name: "Chi", amount: 1840, hand: "Thùng già A" }])).toEqual({ title: "Chi thắng 1.840", detail: "Thùng già A" });
    expect(winnerLines([{ name: "Chi", amount: 40 }])).toEqual({ title: "Chi thắng 40", detail: undefined });
  });

  it("several winners: each one's own amount and own hand, never one hand for all", () => {
    const lines = winnerLines([
      { name: "An", amount: 900, hand: "Thùng già A" },
      { name: "Chi", amount: 300, hand: "Đôi K" },
      { name: "Bình", amount: 50 },
    ]);
    expect(lines).toEqual({ title: "An, Chi, Bình chia pot", detail: "An +900 (Thùng già A) · Chi +300 (Đôi K) · Bình +50" });
  });
});
