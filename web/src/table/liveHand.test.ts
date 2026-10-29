import { describe, expect, it } from "vitest";

import type { HandCategory } from "@/api/protocol";

import { bestHand, CATEGORY_ORDER, compareCategory, liveHand } from "./liveHand";

/** "Ah Kd 9h" -> ["Ah", "Kd", "9h"]; "" -> []. */
const c = (cards: string) => (cards ? cards.split(" ") : []);

/** The cards in another order, the same one on every run (a small seeded generator). */
function shuffled(cards: readonly string[], seed: number): string[] {
  const out = [...cards];
  let s = seed;
  for (let i = out.length - 1; i > 0; i--) {
    s = (s * 16807) % 2147483647;
    const j = s % (i + 1);
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

// [what, the cards, the category, the best five in reading order]
const HANDS: [string, string, HandCategory, string][] = [
  ["a straight flush", "9h 8h 7h 6h 5h 2c Kd", "straight_flush", "9h 8h 7h 6h 5h"],
  ["the highest of six suited cards in a row", "Ah Kh Qh Jh Th 9h 2c", "straight_flush", "Ah Kh Qh Jh Th"],
  ["the steel wheel, ace last", "Ad 2d 3d 4d 5d Kc Kh", "straight_flush", "5d 4d 3d 2d Ad"],
  ["the steel wheel over a six-high straight of mixed suits", "Ad 2d 3d 4d 5d 6c", "straight_flush", "5d 4d 3d 2d Ad"],
  ["a six-high straight flush over the steel wheel", "Ad 2d 3d 4d 5d 6d Kc", "straight_flush", "6d 5d 4d 3d 2d"],
  ["a flush, not a straight flush, from a mixed straight beside it", "9h 8h 7h 6h 4h 2h 5c", "flush", "9h 8h 7h 6h 4h"],
  ["quads and the best kicker", "Qs Qd Qh Qc 4h 9d Kc", "four_of_a_kind", "Qs Qh Qd Qc Kc"],
  ["quads over a full house", "7d 7h 7s 7c Ad Ah 2c", "four_of_a_kind", "7s 7h 7d 7c Ah"],
  ["a full house from two trips, the higher as the three", "9c 9d 9h Kd Kh Ks 2c", "full_house", "Ks Kh Kd 9h 9d"],
  ["a full house from trips and two pairs, the higher pair", "7h 7d 7c 2h 2s Qd Qc", "full_house", "7h 7d 7c Qd Qc"],
  ["the best five of six suited cards", "Kc Ah Th 8h 5h 3h 2h", "flush", "Ah Th 8h 5h 3h"],
  ["the best five of seven suited cards", "Ah Kh 9h 7h 4h 3h 2h", "flush", "Ah Kh 9h 7h 4h"],
  ["a flush over a straight", "9h 8d 7h 6h 5h 2h Tc", "flush", "9h 7h 6h 5h 2h"],
  ["the wheel, ace last", "Ah 2d 3s 4c 5h Kd 9c", "straight", "5h 4c 3s 2d Ah"],
  ["a six-high straight over the wheel", "Ah 2d 3s 4c 5h 6d Kd", "straight", "6d 5h 4c 3s 2d"],
  ["the highest straight of seven in a row", "4c 5d 6h 7s 8c 9d Th", "straight", "Th 9d 8c 7s 6h"],
  ["a straight over trips", "8s 8d 8h 9c Ts Jd Qh", "straight", "Qh Jd Ts 9c 8s"],
  ["a straight over a pair inside it", "9h 8d 8c 7s 6h 5c Kd", "straight", "9h 8d 7s 6h 5c"],
  ["trips and two kickers", "5s 5d 5h Ad Jc 9s 2h", "three_of_a_kind", "5s 5h 5d Ad Jc"],
  ["the top two of three pairs, the third pair as the kicker", "Ah As 9d 9c 6h 6d 2c", "two_pair", "As Ah 9d 9c 6h"],
  ["the top two of three pairs and a higher kicker", "Ah As 9d 9c 6h 6d Kc", "two_pair", "As Ah 9d 9c Kc"],
  ["a pair and three kickers", "Jh Jd Ac 8s 6d 4c 2h", "one_pair", "Jh Jd Ac 8s 6d"],
  ["high card", "Ah Kd 9h 7s 4h 3c 2d", "high_card", "Ah Kd 9h 7s 4h"],
  ["five cards only", "Kh 2c Kd 9s 7h", "one_pair", "Kh Kd 9s 7h 2c"],
];

describe("bestHand", () => {
  it.each(HANDS)("finds %s", (_what, cards, category, five) => {
    expect(bestHand(c(cards))).toEqual({ category, cards: c(five) });
  });

  it("finds the same five whatever order the cards come in", () => {
    for (const [what, cards, category, five] of HANDS) {
      for (let seed = 1; seed <= 20; seed++) {
        expect(bestHand(shuffled(c(cards), seed)), `${what}, shuffle ${seed}`).toEqual({ category, cards: c(five) });
      }
    }
  });

  it("is null for fewer than five or more than seven cards, or a hidden, malformed or repeated card", () => {
    expect(bestHand([])).toBeNull();
    expect(bestHand(c("Ah Kd 9h 7s"))).toBeNull();
    expect(bestHand(c("Ah Kd 9h 7s 4h 3c 2d 5s"))).toBeNull();
    expect(bestHand(c("Ah Kd 9h 7s ??"))).toBeNull();
    expect(bestHand(c("Ah Kd 9h 7s 1h"))).toBeNull();
    expect(bestHand(c("Ah Kd 9h 7s 4x"))).toBeNull();
    expect(bestHand(c("Ah Kd 9h 7s 10h"))).toBeNull();
    expect(bestHand(["Ah", "Kd", "9h", "7s", ""])).toBeNull();
    expect(bestHand(c("Ah Kd 9h 7s 7s"))).toBeNull();
  });
});

describe("CATEGORY_ORDER and compareCategory", () => {
  it("go from the weakest category to the strongest", () => {
    expect(CATEGORY_ORDER).toEqual([
      "high_card",
      "one_pair",
      "two_pair",
      "three_of_a_kind",
      "straight",
      "flush",
      "full_house",
      "four_of_a_kind",
      "straight_flush",
    ]);
    expect(compareCategory("flush", "straight")).toBeGreaterThan(0);
    expect(compareCategory("one_pair", "two_pair")).toBeLessThan(0);
    expect(compareCategory("full_house", "full_house")).toBe(0);
  });
});

describe("liveHand", () => {
  it.each<[string, HandCategory, string, string]>([
    ["Đôi J", "one_pair", "Jh Jd", "Ac 8s 6d"],
    ["Hai đôi A và 9", "two_pair", "Ah 9d", "As 9c 6h 6d 2c"],
    ["Bộ ba 5", "three_of_a_kind", "5s 5d", "5h Ad Jc"],
    ["Sảnh tới 5", "straight", "Ah 2d", "3s 4c 5h"],
    ["Sảnh tới 10", "straight", "Th 9d", "8c 7s 6h"],
    ["Thùng già A", "flush", "Ah 9h", "Kh 4h 2h Qc Jd"],
    ["Cù lũ K đôi 9", "full_house", "Kd 9c", "Kh Ks 9d 2c"],
    ["Tứ quý Q", "four_of_a_kind", "Qs Qd", "Qh Qc 4h"],
    ["Thùng phá sảnh tới 5", "straight_flush", "Ad 2d", "3d 4d 5d"],
    ["Thùng phá sảnh lớn", "straight_flush", "Ah Kh", "Qh Jh Th"],
    ["Mậu thầu A", "high_card", "Ah Kd", "9h 7s 4h"],
  ])("names %s", (name, category, hole, board) => {
    expect(liveHand(c(hole), c(board))).toEqual({ category, name });
  });

  it("before the flop names only a pocket pair", () => {
    expect(liveHand(c("9s 9d"), [])).toEqual({ category: "one_pair", name: "Đôi 9" });
    expect(liveHand(c("Td Tc"), [])).toEqual({ category: "one_pair", name: "Đôi 10" });
    expect(liveHand(c("Ah Kh"), [])).toBeNull();
  });

  it("names the board's hand when the player's cards do not play", () => {
    expect(liveHand(c("2c 3d"), c("Ah Kh Qh Jh Th"))).toEqual({ category: "straight_flush", name: "Thùng phá sảnh lớn" });
    expect(liveHand(c("2c 2d"), c("Ah Kd Qs Jc Th"))).toEqual({ category: "straight", name: "Sảnh tới A" });
  });

  it("gets stronger street by street, which the table can cheer", () => {
    const hole = c("9s 9d");
    const hands = ["", "9c Kd 2h", "9c Kd 2h Kh", "9c Kd 2h Kh 9h"].map((board) => liveHand(hole, c(board))!);
    expect(hands.map((hand) => hand.name)).toEqual(["Đôi 9", "Bộ ba 9", "Cù lũ 9 đôi K", "Tứ quý 9"]);
    for (let i = 1; i < hands.length; i++) expect(compareCategory(hands[i].category, hands[i - 1].category)).toBeGreaterThan(0);
  });

  it("is null without two known cards, or with a board that is not a flop, turn or river", () => {
    expect(liveHand([], c("Ah Kd 9h"))).toBeNull();
    expect(liveHand(c("?? ??"), c("Ah Kd 9h"))).toBeNull();
    expect(liveHand(c("9s"), [])).toBeNull();
    expect(liveHand(c("9s 9d 9h"), [])).toBeNull();
    expect(liveHand(c("9s 9s"), [])).toBeNull();
    expect(liveHand(c("9s 9d"), c("Kh"))).toBeNull();
    expect(liveHand(c("9s 9d"), c("Kh 2c"))).toBeNull();
    expect(liveHand(c("9s 9d"), c("Kh 2c ??"))).toBeNull();
    expect(liveHand(c("9s 9d"), c("Kh 2c 3d 4s 5h 6c"))).toBeNull();
    expect(liveHand(c("9s 9d"), c("9s 2c 3d"))).toBeNull();
  });
});
