// Number and card helpers shared by D1 components (ports of the design kit's fmt / signed / tone).

/** 1460 -> "1.460" (Vietnamese thousands separator). */
export const fmt = (n: number) => String(Math.abs(Math.trunc(n))).replace(/\B(?=(\d{3})+(?!\d))/g, ".");

/** Signed with a real minus sign: +1.130 / −540 / 0. */
export const signed = (n: number) => (n > 0 ? `+${fmt(n)}` : n < 0 ? `−${fmt(n)}` : "0");

/** Colour role of a win/loss figure: matches the .is-gain / .is-loss / .is-even classes. */
export const tone = (n: number): "gain" | "loss" | "even" => (n > 0 ? "gain" : n < 0 ? "loss" : "even");

export type Suit = "♠" | "♥" | "♦" | "♣";
export type Face = { rank: string; suit: Suit };

const SUITS: Record<string, Suit> = { s: "♠", h: "♥", d: "♦", c: "♣" };

/** Protocol card ("As", "Th", "7c"; "??" hidden) -> face, or null for a hidden card. */
export function parseCard(card: string): Face | null {
  if (card.length !== 2 || card === "??") return null;
  const suit = SUITS[card[1]];
  if (!suit) return null;
  const rank = card[0] === "T" ? "10" : card[0];
  return { rank, suit };
}

export const isRed = (face: Face) => face.suit === "♥" || face.suit === "♦";

const SUIT_NAMES: Record<Suit, string> = { "♠": "bích", "♥": "cơ", "♦": "rô", "♣": "chuồn" };

/** Screen-reader name of a card: "A cơ", "10 bích"; hidden cards read "Bài úp". */
export const cardName = (face: Face | null) => (face ? `${face.rank} ${SUIT_NAMES[face.suit]}` : "Bài úp");
