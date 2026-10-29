// Turns the server's TableState into what the D1 table draws: one SeatView per seat (state tag,
// cards, bet, dealer/blind), the pot and the board. Display only: no poker rule is decided here
// (what may be played always comes from legal_actions, who won from hand.completed results).

import type { AppliedAction, ChatMessage, HandPlayer, HandView, LegalActions, PlayerResult, TableState } from "@/api/protocol";
import { fmt, signed } from "@/ui/format";

import { spotOf } from "./geometry";
import { boardHighlights, showdownBySeat, type RunoutWinners, type ShownHand } from "./handName";

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
  /** Hole cards turned face up for everyone (showdown, 7-2, shown after the hand). */
  shown?: boolean;
  isMe?: boolean;
  isButton?: boolean;
  blind?: "SB" | "BB";
  /** Lost the connection: drawn as a flag on the avatar whatever the state. */
  offline?: boolean;
  /** Asked to leave during the hand: stands up when it ends. */
  leaving?: boolean;
  lastAction?: string;
  /** Name of the hand shown at the showdown ("Thùng già A"). */
  hand?: string;
  delta?: { text: string; kind: "gain" | "loss" };
  bubble?: string;
};

/** One board of a hand run twice as the stage draws it. */
export type RunoutView = RunoutWinners & { cards: string[]; hi: number[] };

/** The two boards of a run-twice result, from the socket (Runout) or the replay. */
type RunoutLike = { board: readonly string[]; winners: readonly { player_id: string; seat: number; amount: number }[] };

/** Two cards a player showed after the hand (cards.shown, or the replay's shown_cards). */
type ShownLike = { player_id: string; seat: number; cards: readonly string[] };

export type TableView = {
  seats: SeatView[];
  /** My seat number, null for a spectator. */
  mySeat: number | null;
  board: string[];
  /** Board positions in a hand shown at the showdown (lit; the rest dimmed). */
  boardHi: number[];
  /** A hand run twice: both boards (the first is `board`), each with its lit cards and winners. */
  runouts: RunoutView[] | null;
  /** Rabbit hunt: the cards the empty board slots would have got (display only). */
  rabbit: string[];
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
  /** hand.completed runouts of the hand on the table (run twice): who each board paid. */
  runouts?: readonly RunoutLike[] | null;
  /** hand.completed rabbit_cards of the hand on the table. */
  rabbit?: readonly string[];
  /** Cards turned face up for the whole table after the hand (cards.shown), by seat. */
  shown?: readonly ShownLike[];
};

export function tableView(table: TableState, extras: ViewExtras = {}): TableView {
  const { room, seats, hand, you } = table;
  // My seat at the bottom centre; the seat list is the truth if `you.seat` lags behind it.
  const anchor = seats.find((s) => s.player_id === you.player_id)?.seat ?? you.seat ?? 1;
  const live = !!hand && !hand.complete;
  // a bomb pot has no blinds: no SB/BB markers
  const blinds = live && !hand.bomb_pot ? blindSeats(hand) : undefined;
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
    // shown after the hand: face up for everyone, folded or not
    const showed = hand?.complete && player ? extras.shown?.find((h) => h.seat === seat && h.player_id === occupant.player_id) : undefined;
    if (showed) cards = [...showed.cards];
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
      leaving: occupant.leaving,
      lastAction,
      hand: handNames[seat],
      delta: result && net !== 0 ? { text: signed(net), kind: net > 0 ? "gain" : "loss" } : undefined,
      bubble,
    });
  }

  const pot = (hand?.pots ?? []).reduce((sum, p) => sum + p.amount, 0);
  const bets = live ? hand.players.reduce((sum, p) => sum + p.bet, 0) : 0;
  const board = hand?.board ?? [];
  // Run twice: each board lights the hands of whoever it paid (its own winners, not the hand's).
  const second = hand?.complete ? hand.second_board : null;
  const nameOf = (playerId: string) => seats.find((s) => s.player_id === playerId)?.display_name ?? "?";
  const runs = second ? [board, second] : null;
  // The server sends a board without winners when one player took every board and the others
  // mucked (the engine pays that as an uncontested pot): the hand's winners took it, amount unsaid.
  const scooped = (results ? results.filter((r) => r.hand_net > 0).map((r) => r.player_id) : extras.winners) ?? [];
  const runouts = runs?.map((cards, i): RunoutView => {
    const paid = hand?.complete ? extras.runouts?.[i]?.winners : undefined;
    const lit = paid?.length ? paid.map((w) => w.player_id) : winners;
    return {
      cards: [...cards],
      hi: boardHighlights(showdown?.filter((h) => !lit || lit.includes(h.player_id)), cards, i + 1),
      winners: paid?.length ? paid.map((w) => ({ name: nameOf(w.player_id), amount: w.amount })) : scooped.map((id) => ({ name: nameOf(id) })),
    };
  });
  return {
    seats: views,
    mySeat: you.seat,
    board,
    // Only the winners' hands light the board (a shown loser's hand would mislead).
    boardHi: runouts ? runouts[0].hi : boardHighlights(showdown?.filter((h) => !winners || winners.includes(h.player_id)), board),
    runouts: runouts ?? null,
    rabbit: hand?.complete && board.length < 5 ? (extras.rabbit ?? []).slice(0, 5 - board.length) : [],
    pot,
    potTotal: pot + bets,
    bets,
    inHand: hand ? hand.players.filter((p) => p.in_hand).length : 0,
  };
}

export type Preset = { label: string; amount: number };

/** What a raise-to amount is measured against (the quick sizes, the caption under the amount). */
export type RaiseSizing = {
  /** The room's big blind. */
  bigBlind: number;
  /** The highest bet on this street: a raise goes to a total above it. */
  topBet: number;
  /** The pot once I have called: the collected pots, every bet on the table and my call. */
  potAfterCall: number;
};

/** The top bet and the pot after my call, as the hand stands for my decision. */
export function raiseSizing(hand: HandView, legal: LegalActions, bigBlind: number): RaiseSizing {
  const topBet = Math.max(0, ...hand.players.map((p) => p.bet));
  const pot = hand.pots.reduce((s, p) => s + p.amount, 0) + hand.players.reduce((s, p) => s + p.bet, 0);
  return { bigBlind, topBet, potAfterCall: pot + legal.call_amount };
}

/**
 * Raise-to sizes for the quick buttons, smallest first, at most six: Min, then by the situation
 * - before the flop with nobody in above the big blind: 2,5 / 3 / 4 big blinds and the pot,
 * - facing a bet or a raise: 2,5 and 3 times that bet and the pot,
 * - after the flop with no bet yet: ⅓, ½, ⅔ of the pot and the pot,
 * then All-in. A size the server's range turns into Min or All-in is dropped (Min and All-in stay),
 * and of two equal sizes the first listed stays.
 */
export function raisePresets(hand: HandView, legal: LegalActions, bigBlind: number): Preset[] {
  if (legal.min_raise_to === null || legal.max_raise_to === null) return [];
  const min = legal.min_raise_to;
  const max = legal.max_raise_to;
  if (max <= min) return [{ label: "All-in", amount: max }];
  const { topBet, potAfterCall } = raiseSizing(hand, legal, bigBlind);
  // Pot-sized raise: call first, then raise by (a share of) the pot that results.
  const pot = (share: number) => topBet + potAfterCall * share;
  const unopened = hand.board.length === 0 && topBet <= bigBlind;
  const sizes: [string, number][] = unopened
    ? [["2,5 BB", 2.5 * bigBlind], ["3 BB", 3 * bigBlind], ["4 BB", 4 * bigBlind], ["Pot", pot(1)]]
    : legal.call_amount > 0
      ? [["2,5×", 2.5 * topBet], ["3×", 3 * topBet], ["Pot", pot(1)]]
      : [["⅓ pot", pot(1 / 3)], ["½ pot", pot(1 / 2)], ["⅔ pot", pot(2 / 3)], ["Pot", pot(1)]];
  const between = sizes
    .map(([label, size]) => ({ label, amount: Math.round(size) }))
    .filter((p) => p.amount > min && p.amount < max)
    .sort((a, b) => a.amount - b.amount); // stable: the first listed of two equal sizes comes first
  const presets: Preset[] = [{ label: "Min", amount: min }];
  for (const p of between) if (p.amount !== presets.at(-1)!.amount) presets.push(p);
  presets.push({ label: "All-in", amount: max });
  return presets;
}

/** Big blinds with one decimal at most, written the Vietnamese way: 2,5 / 3 / 1.250. */
function inBlinds(amount: number, bigBlind: number): string {
  const tenths = Math.round((amount / bigBlind) * 10);
  const whole = fmt(Math.trunc(tenths / 10));
  return tenths % 10 ? `${whole},${tenths % 10}` : whole;
}

/** The caption under the amount, "3 BB · 75% pot": the raise-to amount in big blinds, and what it
 *  adds on top of the call as a share of the pot after calling (so the Pot button reads 100%). */
export function sizeCaption(amount: number, sizing: RaiseSizing): string {
  const parts: string[] = [];
  if (sizing.bigBlind > 0) parts.push(`${inBlinds(amount, sizing.bigBlind)} BB`);
  if (sizing.potAfterCall > 0) parts.push(`${fmt(Math.round((Math.max(0, amount - sizing.topBet) / sizing.potAfterCall) * 100))}% pot`);
  return parts.join(" · ");
}

const VERB: Record<AppliedAction["kind"], string> = { fold: "bỏ bài", check: "check", call: "theo", raise: "tố lên" };

/** One line for the log / replay caption: "An tố lên 120", "Bình bỏ bài (hết giờ)". */
export function describeAction(action: AppliedAction, name: string): string {
  const amount = action.kind === "raise" ? ` ${fmt(action.amount)}` : "";
  return `${name} ${VERB[action.kind]}${amount}${action.timeout ? " (hết giờ)" : ""}`;
}
