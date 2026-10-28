// Turns the server's TableState into what the D1 table draws: one SeatView per seat (state tag,
// cards, bet, dealer/blind), the pot and the board. Display only: no poker rule is decided here
// (what may be played always comes from legal_actions, who won from hand.completed results).

import type { AppliedAction, ChatMessage, HandPlayer, HandView, LegalActions, PlayerResult, TableState } from "@/api/protocol";
import { fmt, signed } from "@/ui/format";

import { spotOf } from "./geometry";
import { boardHighlights, showdownBySeat, type ShownHand } from "./handName";

export type SeatState = "turn" | "waiting" | "folded" | "all-in" | "sitting-out" | "disconnected" | "winner" | "empty";

export type SeatView = {
  /** Server seat number. */
  seat: number;
  /** Place on the stage (geometry.ts spots). */
  spot: number;
  state: SeatState;
  playerId?: string;
  name?: string;
  stack?: number;
  bet?: number;
  /** Protocol cards; "??" are backs. Empty when not dealt in or folded. */
  cards?: string[];
  /** Hole cards turned face up for everyone (showdown, 7-2). */
  shown?: boolean;
  isMe?: boolean;
  isButton?: boolean;
  blind?: "SB" | "BB";
  /** Lost the connection: drawn as a flag on the avatar whatever the state. */
  offline?: boolean;
  lastAction?: string;
  /** Name of the hand shown at the showdown ("Thùng già A"). */
  hand?: string;
  delta?: { text: string; kind: "gain" | "loss" };
  bubble?: string;
};

export type TableView = {
  seats: SeatView[];
  /** My seat number, null for a spectator. */
  mySeat: number | null;
  board: string[];
  /** Board positions in a hand shown at the showdown (lit; the rest dimmed). */
  boardHi: number[];
  /** Chips in the middle (collected pots), bets in front of the seats excluded. */
  pot: number;
  /** Pot plus every bet on the table. */
  potTotal: number;
  /** Bets in front of the seats. */
  bets: number;
  /** Players still holding cards in the running hand. */
  inHand: number;
};

/** Seats of the players dealt in, in seat order, starting after `seat`. */
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

/** Dealing order: from the small blind round the table (heads-up the button deals itself first). */
export function dealOrder(hand: HandView): number[] {
  const { sb } = blindSeats(hand);
  const seats = hand.players.map((p) => p.seat).sort((a, b) => a - b);
  return [...seats.filter((s) => s >= sb), ...seats.filter((s) => s < sb)];
}

/** Showdown order until the server sends one: left of the button, round the table. */
export function showdownOrder(hand: HandView): number[] {
  return seatsAfter(hand.players, hand.button_seat);
}

/** Words under a seat for its last action this street ("Theo 40", "Tố 120", "Bỏ"). */
export function actionLabel(action: AppliedAction, player: HandPlayer | undefined): string {
  const allIn = !!player && player.in_hand && player.stack === 0;
  switch (action.kind) {
    case "fold":
      return action.timeout ? "Hết giờ · bỏ" : "Bỏ";
    case "check":
      return action.timeout ? "Hết giờ · check" : "Check";
    case "call":
      return allIn ? `All-in ${fmt(player!.bet)}` : `Theo ${fmt(player?.bet ?? 0)}`;
    case "raise":
      return allIn ? `All-in ${fmt(action.amount)}` : `Tố ${fmt(action.amount)}`;
  }
}

export type ViewExtras = {
  /** Last action of each seat in the running hand (reducer.lastActions). */
  lastActions?: Record<number, AppliedAction>;
  /** hand.completed results of the hand on the table. */
  results?: PlayerResult[] | null;
  /** hand.completed showdown of the hand on the table: the names of the shown hands. */
  showdown?: readonly ShownHand[] | null;
  /** Who won, when `results` are not given (the replay): only their hands light the board. */
  winners?: string[];
  /** Recent chat lines, shown as bubbles over the speakers' seats. */
  bubbles?: ChatMessage[];
  /** My hole cards of the hand on the table: the completed hand drops a showdown loser's cards,
   *  but I saw mine, so they stay in front of me until the next hand. */
  myCards?: string[];
};

export function tableView(table: TableState, extras: ViewExtras = {}): TableView {
  const { room, seats, hand, you } = table;
  // My seat at the bottom centre; the seat list is the truth if `you.seat` lags behind it.
  const anchor = seats.find((s) => s.player_id === you.player_id)?.seat ?? you.seat ?? 1;
  const live = !!hand && !hand.complete;
  const blinds = live ? blindSeats(hand) : undefined;
  const results = hand?.complete ? (extras.results ?? null) : null;
  const showdown = hand?.complete ? (extras.showdown ?? null) : null;
  const handNames = showdownBySeat(showdown);
  // Whose hand lights the board: a split pot leaves the tied players at +0, while a shown loser
  // always ends below 0 (they paid at least a blind), so >= 0 among the shown hands.
  const winners = results ? results.filter((r) => r.hand_net >= 0).map((r) => r.player_id) : extras.winners;

  const views: SeatView[] = [];
  for (let seat = 1; seat <= room.max_seats; seat++) {
    const spot = spotOf(seat, room.max_seats, anchor);
    const occupant = seats.find((s) => s.seat === seat);
    if (!occupant) {
      views.push({ seat, spot, state: "empty" });
      continue;
    }
    const isMe = occupant.player_id === you.player_id;
    const player = hand?.players.find((p) => p.seat === seat && p.player_id === occupant.player_id);
    const result = results?.find((r) => r.player_id === occupant.player_id);
    const net = result ? result.hand_net + result.seven_deuce_net : 0;

    // A completed hand reports showdown losers as out of the hand too: only a real fold (seen in
    // this hand's actions) is drawn as folded then.
    const folded = player && !player.in_hand && (live || extras.lastActions?.[seat]?.kind === "fold" || !extras.lastActions);
    let state: SeatState = "waiting";
    if (result && result.hand_net > 0) state = "winner";
    else if (live && hand.actor === occupant.player_id) state = "turn";
    else if (folded) state = "folded";
    else if (!occupant.connected) state = "disconnected";
    else if (occupant.sitting_out) state = "sitting-out";
    else if (live && player && player.stack === 0) state = "all-in";

    let cards = player && player.in_hand ? player.cards : [];
    if (isMe && hand?.complete && !folded && cards.length === 0 && extras.myCards?.length) cards = extras.myCards;
    const faceUp = cards.length > 0 && cards.every((c) => c !== "??");
    const last = extras.lastActions?.[seat];
    let lastAction: string | undefined;
    if (state === "sitting-out") lastAction = "Đang nghỉ";
    else if (state === "disconnected") lastAction = "Mất kết nối";
    else if (live && last) lastAction = actionLabel(last, player);
    const bubble = extras.bubbles?.filter((m) => m.player_id === occupant.player_id).at(-1)?.text;

    views.push({
      seat,
      spot,
      state,
      playerId: occupant.player_id,
      name: occupant.display_name,
      // During a hand: chips still behind the line. After it: the room balance, which
      // hand.completed already moved into the seat (7-2 bonus included).
      stack: player && live ? player.stack : occupant.stack,
      bet: live && player ? player.bet : 0,
      cards,
      shown: !isMe && faceUp,
      isMe,
      isButton: !!hand && hand.button_seat === seat,
      blind: blinds?.sb === seat ? "SB" : blinds?.bb === seat ? "BB" : undefined,
      offline: !occupant.connected,
      lastAction,
      hand: handNames[seat],
      delta: result && net !== 0 ? { text: signed(net), kind: net > 0 ? "gain" : "loss" } : undefined,
      bubble,
    });
  }

  const pot = (hand?.pots ?? []).reduce((sum, p) => sum + p.amount, 0);
  const bets = live ? hand.players.reduce((sum, p) => sum + p.bet, 0) : 0;
  return {
    seats: views,
    mySeat: you.seat,
    board: hand?.board ?? [],
    // Only the winners' hands light the board (a shown loser's hand would mislead).
    boardHi: boardHighlights(showdown?.filter((h) => !winners || winners.includes(h.player_id)), hand?.board ?? []),
    pot,
    potTotal: pot + bets,
    bets,
    inHand: hand ? hand.players.filter((p) => p.in_hand).length : 0,
  };
}

export type Preset = { label: string; amount: number };

/** Raise-to sizes for the quick buttons, clamped to the server's range (½ pot, ¾ pot, pot, all-in). */
export function raisePresets(hand: HandView, legal: LegalActions): Preset[] {
  if (legal.min_raise_to === null || legal.max_raise_to === null) return [];
  const min = legal.min_raise_to;
  const max = legal.max_raise_to;
  const topBet = Math.max(...hand.players.map((p) => p.bet));
  const pot = hand.pots.reduce((s, p) => s + p.amount, 0) + hand.players.reduce((s, p) => s + p.bet, 0);
  // Pot-sized raise: call first, then raise by the pot that results.
  const potAfterCall = pot + legal.call_amount;
  const clamp = (v: number) => Math.min(max, Math.max(min, Math.round(v)));
  return [
    { label: "½ pot", amount: clamp(topBet + potAfterCall / 2) },
    { label: "¾ pot", amount: clamp(topBet + (potAfterCall * 3) / 4) },
    { label: "Pot", amount: clamp(topBet + potAfterCall) },
    { label: "All-in", amount: max },
  ];
}

const VERB: Record<AppliedAction["kind"], string> = { fold: "bỏ bài", check: "check", call: "theo", raise: "tố lên" };

/** One line for the log / replay caption: "An tố lên 120", "Bình bỏ bài (hết giờ)". */
export function describeAction(action: AppliedAction, name: string): string {
  const amount = action.kind === "raise" ? ` ${fmt(action.amount)}` : "";
  return `${name} ${VERB[action.kind]}${amount}${action.timeout ? " (hết giờ)" : ""}`;
}
