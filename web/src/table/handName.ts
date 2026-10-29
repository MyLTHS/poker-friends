// Words for the made hands of a showdown (hand.completed.payload.showdown). The server decides
// the hand and orders its five cards most significant first (docs/api/ws-protocol.md): this only
// reads cards[0] (and cards[2] / cards[3]) to write "Thùng già A", "Cù lũ K đôi 9".

import type { HandCategory } from "@/api/protocol";
import { fmt } from "@/ui/format";

/** A ShowdownHand from the socket or from the REST replay (which types cards as a plain array).
 *  `board`: 1, or 2 for the second board of a hand run twice. */
export type ShownHand = { player_id: string; seat: number; board?: number; category: HandCategory; cards: readonly string[] };

const rank = (card: string) => (card[0] === "T" ? "10" : card[0]);

export function handName({ category, cards }: ShownHand): string {
  const top = rank(cards[0]);
  switch (category) {
    case "high_card":
      return `Mậu thầu ${top}`;
    case "one_pair":
      return `Đôi ${top}`;
    case "two_pair":
      return `Hai đôi ${top} và ${rank(cards[2])}`;
    case "three_of_a_kind":
      return `Bộ ba ${top}`;
    case "straight":
      return `Sảnh tới ${top}`;
    case "flush":
      return `Thùng già ${top}`;
    case "full_house":
      return `Cù lũ ${top} đôi ${rank(cards[3])}`;
    case "four_of_a_kind":
      return `Tứ quý ${top}`;
    case "straight_flush":
      return top === "A" ? "Thùng phá sảnh lớn" : `Thùng phá sảnh tới ${top}`;
  }
}

/** Seat number -> name of the hand shown there. A hand run twice names one per board: "Đôi A /
 *  Sảnh tới 9" (one name when both boards make the same). */
export function showdownBySeat(showdown: readonly ShownHand[] | null | undefined): Record<number, string> {
  const names: Record<number, string[]> = {};
  for (const entry of showdown ?? []) {
    const name = handName(entry);
    const list = (names[entry.seat] ??= []);
    if (!list.includes(name)) list.push(name);
  }
  return Object.fromEntries(Object.entries(names).map(([seat, list]) => [seat, list.join(" / ")]));
}

/** Board positions that are part of a shown hand (the design lights them, dims the rest). With
 *  `board` (1 or 2), only the hands made on that board of a hand run twice. */
export function boardHighlights(showdown: readonly ShownHand[] | null | undefined, cards: readonly string[], board?: number): number[] {
  const used = new Set((showdown ?? []).filter((entry) => board === undefined || (entry.board ?? 1) === board).flatMap((entry) => entry.cards));
  return cards.flatMap((card, i) => (used.has(card) ? [i] : []));
}

export type Winner = { name: string; amount: number; hand?: string };

/** "Chi thắng 1.840" + "Thùng già A"; several winners each keep their own amount and hand. */
export function winnerLines(winners: Winner[]): { title: string; detail?: string } {
  if (winners.length === 1) return { title: `${winners[0].name} thắng ${fmt(winners[0].amount)}`, detail: winners[0].hand };
  return {
    title: `${winners.map((w) => w.name).join(", ")} chia pot`,
    detail: winners.map((w) => `${w.name} +${fmt(w.amount)}${w.hand ? ` (${w.hand})` : ""}`).join(" · "),
  };
}

/** One board of a hand run twice, its winners named (`amount` unknown: see seatView's runouts). */
export type RunoutWinners = { winners: { name: string; amount?: number }[] };

/** "An +500" / "An +250, Bình +250": who one board of a hand run twice paid. */
export function runoutText({ winners }: RunoutWinners): string {
  return winners.map((w) => (w.amount === undefined ? w.name : `${w.name} +${fmt(w.amount)}`)).join(", ");
}

/** The result of a hand run twice: "Chạy 2 lần" + "Lần 1: An +500 · Lần 2: Bình +500", or
 *  "An thắng cả 2 lần" when one player took both boards. */
export function runoutLines(runouts: RunoutWinners[]): { title: string; detail: string } {
  const names = runouts.map((r) => r.winners.map((w) => w.name).join(", "));
  if (names[0] && runouts.every((r, i) => r.winners.length === 1 && names[i] === names[0])) {
    const amounts = runouts.map((r) => r.winners[0].amount);
    const each = amounts.every((a) => a !== undefined) ? ` (${amounts.map((a, i) => `lần ${i + 1} +${fmt(a!)}`).join(", ")})` : "";
    return { title: "Chạy 2 lần", detail: `${names[0]} thắng cả 2 lần${each}` };
  }
  return { title: "Chạy 2 lần", detail: runouts.map((r, i) => `Lần ${i + 1}: ${runoutText(r) || "không ai"}`).join(" · ") };
}

const STRENGTH: HandCategory[] = ["high_card", "one_pair", "two_pair", "three_of_a_kind", "straight", "flush", "full_house", "four_of_a_kind", "straight_flush"];

/** A made hand worth a moment of its own at the showdown: a full house or better. */
export function bigHandTitle(hand: ShownHand): string | null {
  switch (hand.category) {
    case "full_house":
      return "Cù lũ!";
    case "four_of_a_kind":
      return "Tứ quý!";
    case "straight_flush":
      return rank(hand.cards[0]) === "A" ? "Thùng phá sảnh lớn!" : "Thùng phá sảnh!";
    default:
      return null;
  }
}

/** The strongest big hand of a showdown (full house or better), or null. */
export function biggestHand(showdown: readonly ShownHand[] | null | undefined): ShownHand | null {
  let best: ShownHand | null = null;
  for (const h of showdown ?? []) {
    if (!bigHandTitle(h)) continue;
    if (!best || STRENGTH.indexOf(h.category) > STRENGTH.indexOf(best.category)) best = h;
  }
  return best;
}

const ORDER = "23456789TJQKA";

/** Two hole cards worth a little shine when they are turned over: a pair of tens or better, A-K,
 *  or A-Q suited. "??" (hidden) is never one. */
export function isPremiumStart(cards: readonly string[]): boolean {
  if (cards.length !== 2 || cards.some((c) => c.length < 2 || !ORDER.includes(c[0]))) return false;
  const [hi, lo] = [...cards].sort((a, b) => ORDER.indexOf(b[0]) - ORDER.indexOf(a[0]));
  if (hi[0] === lo[0]) return ORDER.indexOf(hi[0]) >= ORDER.indexOf("T");
  if (hi[0] !== "A") return false;
  return lo[0] === "K" || (lo[0] === "Q" && hi[1] === lo[1]);
}
