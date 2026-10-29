// The made hand a player holds while the hand is still running ("Đôi J", "Thùng già A"), so the
// table can show it and cheer when it gets stronger. The server names hands only at the showdown
// (handName.ts); this finds the best five of the player's two cards and the board on the client,
// in the server's reading order (docs/api/ws-protocol.md: bigger groups first, then higher ranks,
// the ace of a five-high straight last), so handName() words both the same way.

import type { HandCategory } from "@/api/protocol";

import { handName } from "./handName";

/** Weakest first. */
export const CATEGORY_ORDER: readonly HandCategory[] = [
  "high_card",
  "one_pair",
  "two_pair",
  "three_of_a_kind",
  "straight",
  "flush",
  "full_house",
  "four_of_a_kind",
  "straight_flush",
];

/** Below 0 when `a` is the weaker category, 0 for the same one, above 0 when `a` is stronger. */
export function compareCategory(a: HandCategory, b: HandCategory): number {
  return CATEGORY_ORDER.indexOf(a) - CATEGORY_ORDER.indexOf(b);
}

/** A made hand: its category and its five cards, most significant first. */
export type MadeHand = { category: HandCategory; cards: string[] };

/** What the table shows: { category: "one_pair", name: "Đôi J" }. */
export type LiveHand = { category: HandCategory; name: string };

const RANKS = "23456789TJQKA";
const SUITS = "shdc";

/** Real cards ("Ah", "Td"): none hidden ("??"), malformed or there twice. */
function known(cards: readonly string[]): boolean {
  const real = cards.every((card) => card.length === 2 && RANKS.includes(card[0]) && SUITS.includes(card[1]));
  return real && new Set(cards).size === cards.length;
}

/** Every way to pick `k` of the cards: those with the first card, then those without it. */
function choose(cards: readonly string[], k: number): string[][] {
  if (k === 0) return [[]];
  if (cards.length < k) return [];
  const [first, ...rest] = cards;
  return [...choose(rest, k - 1).map((picked) => [first, ...picked]), ...choose(rest, k)];
}

/** The size of each card's rank group, in reading order -> what five cards make when they are
 *  neither a straight nor a flush (those two have five different ranks: "11111"). */
const SHAPES: Record<string, HandCategory> = {
  "44441": "four_of_a_kind",
  "33322": "full_house",
  "33311": "three_of_a_kind",
  "22221": "two_pair",
  "22111": "one_pair",
  "11111": "high_card",
};

type Rated = MadeHand & { score: number[] };

/** Five cards: their category, the cards in reading order and a score to compare hands by (the
 *  category, then the ranks in reading order, which is how poker breaks a tie). */
function rate(five: readonly string[]): Rated {
  const count = (rank: string) => five.filter((card) => card[0] === rank).length;
  // The wheel (A-2-3-4-5) counts its ace as one: the lowest straight, its ace last.
  const wheel = [..."A2345"].every((rank) => count(rank) > 0);
  const value = (card: string) => (wheel && card[0] === "A" ? -1 : RANKS.indexOf(card[0]));
  const cards = [...five].sort((a, b) => count(b[0]) - count(a[0]) || value(b) - value(a));
  const values = cards.map(value);
  const straight = new Set(values).size === 5 && values[0] - values[4] === 4;
  const flush = five.every((card) => card[1] === five[0][1]);
  let category = SHAPES[cards.map((card) => count(card[0])).join("")];
  if (straight) category = flush ? "straight_flush" : "straight";
  else if (flush) category = "flush";
  return { category, cards, score: [CATEGORY_ORDER.indexOf(category), ...values] };
}

/** Whether score `a` is above `b`: the first place they differ decides. */
function beats(a: readonly number[], b: readonly number[]): boolean {
  const i = a.findIndex((v, j) => v !== b[j]);
  return i >= 0 && a[i] > b[i];
}

/** The best five of 5 to 7 known cards (two hole cards and a board), in reading order. Null for
 *  fewer or more cards, or a card hidden ("??"), malformed or there twice. */
export function bestHand(cards: readonly string[]): MadeHand | null {
  if (cards.length < 5 || cards.length > 7 || !known(cards)) return null;
  // A fixed order first (higher ranks, then s h d c), so the same cards always give the same five.
  const sorted = [...cards].sort((a, b) => RANKS.indexOf(b[0]) - RANKS.indexOf(a[0]) || SUITS.indexOf(a[1]) - SUITS.indexOf(b[1]));
  const best = choose(sorted, 5)
    .map(rate)
    .reduce((top, hand) => (beats(hand.score, top.score) ? hand : top));
  return { category: best.category, cards: best.cards };
}

/** handName() words a showdown entry: only its category and cards matter, not a seat. */
function named({ category, cards }: { category: HandCategory; cards: readonly string[] }): LiveHand {
  return { category, name: handName({ player_id: "", seat: 0, category, cards }) };
}

/** The made hand a player holds now, named for the table. Before the flop only a pocket pair
 *  ("Đôi 9"); from the flop on, the best five of their two cards and the board, even when the
 *  board alone makes it. Null without two known cards (folded, hidden "??"), for two unpaired
 *  cards before the flop, and for a board that is not a flop, turn or river. */
export function liveHand(hole: readonly string[], board: readonly string[]): LiveHand | null {
  if (hole.length !== 2 || !known(hole)) return null;
  if (board.length === 0) return hole[0][0] === hole[1][0] ? named({ category: "one_pair", cards: hole }) : null;
  const best = bestHand([...hole, ...board]);
  return best && named(best);
}
