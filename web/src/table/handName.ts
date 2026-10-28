// Words for the made hands of a showdown (hand.completed.payload.showdown). The server decides
// the hand and orders its five cards most significant first (docs/api/ws-protocol.md): this only
// reads cards[0] (and cards[2] / cards[3]) to write "Thùng già A", "Cù lũ K đôi 9".

import type { HandCategory } from "@/api/protocol";

/** A ShowdownHand from the socket or from the REST replay (which types cards as a plain array). */
export type ShownHand = { player_id: string; seat: number; category: HandCategory; cards: readonly string[] };

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

/** Seat number -> name of the hand shown there. */
export function showdownBySeat(showdown: readonly ShownHand[] | null | undefined): Record<number, string> {
  return Object.fromEntries((showdown ?? []).map((entry) => [entry.seat, handName(entry)]));
}

/** Board positions that are part of a shown hand (the design lights them, dims the rest). */
export function boardHighlights(showdown: readonly ShownHand[] | null | undefined, board: string[]): number[] {
  const used = new Set((showdown ?? []).flatMap((entry) => entry.cards));
  return board.flatMap((card, i) => (used.has(card) ? [i] : []));
}
