// Turns the server's TableState into the props of the direction-A <Table>. Display only: no
// poker rule is decided here (what may be played always comes from legal_actions).

import type { AppliedAction, HandPlayer, HandView, LegalActions, TableState } from "@/api/protocol";
import type { ClubPlayer } from "@/club/Seat";

const RANKS: Record<string, string> = { T: "10" };
const SUITS: Record<string, string> = { c: "♣", d: "♦", h: "♥", s: "♠" };

/** "Th" -> "10♥", "As" -> "A♠"; "??" stays "??" (a face-down card). */
export function toClubCard(card: string): string {
  if (card === "??") return card;
  const rank = card.slice(0, -1);
  return `${RANKS[rank] ?? rank}${SUITS[card.slice(-1)] ?? "?"}`;
}

const AVATAR_COLORS = ["#4d7ee8", "#e88155", "#419ca2", "#9c6de8", "#dd6c87", "#b58a46", "#7773c9", "#cc658e", "#5aa469"];

export const avatarColor = (seat: number) => AVATAR_COLORS[(seat - 1) % AVATAR_COLORS.length];

export function initials(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  const letters = words.length > 1 ? words[0][0] + words[words.length - 1][0] : name.trim().slice(0, 2);
  return letters.toLocaleUpperCase("vi-VN");
}

export type TableView = {
  players: ClubPlayer[];
  heroIndex: number;
  dealerIndex?: number;
  smallBlindIndex?: number;
  bigBlindIndex?: number;
  board: string[];
  pot: number;
};

/** Seats of the players still dealt in, in seat order, starting after `seat`. */
function seatsAfter(players: HandPlayer[], seat: number): number[] {
  const seats = players.map((p) => p.seat).sort((a, b) => a - b);
  return [...seats.filter((s) => s > seat), ...seats.filter((s) => s <= seat)];
}

/** Blind seats for the markers. Heads-up the button posts the small blind. */
export function blindSeats(hand: HandView): { sb: number; bb: number } {
  if (hand.players.length === 2) {
    const other = hand.players.find((p) => p.seat !== hand.button_seat)!;
    return { sb: hand.button_seat, bb: other.seat };
  }
  const order = seatsAfter(hand.players, hand.button_seat);
  return { sb: order[0], bb: order[1] };
}

export function tableView(table: TableState): TableView {
  const { room, seats, hand, you } = table;
  const players: ClubPlayer[] = [];
  for (let seat = 1; seat <= room.max_seats; seat++) {
    const occupant = seats.find((s) => s.seat === seat);
    const inHand = hand?.players.find((p) => p.seat === seat);
    if (!occupant) {
      players.push({ name: "Ghế trống", stack: 0, avatar: "+", state: "empty" });
      continue;
    }
    const isYou = occupant.player_id === you.player_id;
    const visibleCards = inHand?.cards.filter((c) => c !== "??") ?? [];
    const holdingHidden = !!inHand && inHand.in_hand && inHand.cards.some((c) => c === "??");
    let state: ClubPlayer["state"];
    if (hand && !hand.complete && hand.actor === occupant.player_id) state = "turn";
    else if (inHand && !inHand.in_hand) state = "folded";
    else if (!occupant.connected) state = "offline";
    else if (occupant.sitting_out) state = "sitout";
    players.push({
      name: occupant.display_name,
      // During a hand: chips still in front of the player. After it: the room balance, which
      // hand.completed results already moved into the seat (includes the 7-2 bonus).
      stack: inHand && !hand?.complete ? inHand.stack : occupant.stack,
      avatar: initials(occupant.display_name),
      avatarColor: avatarColor(seat),
      bet: inHand?.bet || undefined,
      state,
      cards: isYou || visibleCards.length > 0 ? visibleCards.map(toClubCard) : undefined,
      holding: holdingHidden && !isYou,
    });
  }

  const board = (hand?.board ?? []).map(toClubCard);
  while (board.length < 5) board.push("—");
  const blinds = hand && !hand.complete ? blindSeats(hand) : undefined;
  return {
    players,
    heroIndex: you.seat === null ? -1 : you.seat - 1,
    dealerIndex: hand ? hand.button_seat - 1 : undefined,
    smallBlindIndex: blinds ? blinds.sb - 1 : undefined,
    bigBlindIndex: blinds ? blinds.bb - 1 : undefined,
    board,
    pot: (hand?.pots ?? []).reduce((sum, pot) => sum + pot.amount, 0),
  };
}

const ACTION_LABELS: Record<AppliedAction["kind"], string> = {
  fold: "bỏ bài",
  check: "check",
  call: "theo",
  raise: "tố lên",
};

export function describeAction(action: AppliedAction, table: TableState) {
  const name = table.seats.find((s) => s.player_id === action.player_id)?.display_name ?? `Ghế ${action.seat}`;
  const label = ACTION_LABELS[action.kind] + (action.timeout ? " (hết giờ)" : "");
  return { player: name, label, amount: action.kind === "raise" ? action.amount : undefined };
}

/** Raise-to sizes for the quick buttons, clamped to the server's range. */
export function raisePresets(hand: HandView, legal: LegalActions) {
  if (legal.min_raise_to === null || legal.max_raise_to === null) return [];
  const min = legal.min_raise_to;
  const max = legal.max_raise_to;
  const topBet = Math.max(...hand.players.map((p) => p.bet));
  const pot = hand.pots.reduce((s, p) => s + p.amount, 0) + hand.players.reduce((s, p) => s + p.bet, 0);
  // Pot-sized raise: call first, then raise by the pot that results.
  const potAfterCall = pot + legal.call_amount;
  const clamp = (v: number) => Math.min(max, Math.max(min, Math.round(v)));
  return [
    { label: "1/2 POT", value: clamp(topBet + potAfterCall / 2) },
    { label: "3/4 POT", value: clamp(topBet + (potAfterCall * 3) / 4) },
    { label: "POT", value: clamp(topBet + potAfterCall) },
    { label: "ALL-IN", value: max },
  ];
}
