// Animation cues: what moved on the table because of one state event, worked out from the table
// before and after it (docs/c2-chuyen-dong.md §c). The reducer applies the event at once and
// queues these; TableFx plays them over the already-correct state. Never made for a snapshot or
// for events re-applied after one (the screen jumps straight to the right state).

import type { HandView, TableState } from "@/api/protocol";

import type { StateEvent } from "./reducer";
import { bigHandTitle, biggestHand } from "./handName";
import { dealOrder, showdownOrder } from "./seatView";

/** What one action was, as a player hears and sees it ("bet" opens the betting on a street,
 *  "raise" goes over a bet, "allin" is any call or raise that puts the last chip in). */
export type Move = "fold" | "check" | "call" | "bet" | "raise" | "allin";

export type CueBody =
  /** every applied action, before its other cues: the seat's own small moment and its sound.
   *  `put` = chips it put in, `call` = what it had to put in just to call, `pot` = chips in the
   *  middle (pots + bets) just before it. */
  | { kind: "act"; seat: number; move: Move; put: number; call: number; pot: number; timeout: boolean }
  /** hand.started: cards fly from the deck, round-robin from the small blind. */
  | { kind: "deal"; order: number[] }
  /** call / raise: the seat's bet slides out from the seat. */
  | { kind: "bet"; seat: number }
  /** fold: the seat's cards go to the middle. */
  | { kind: "fold"; seat: number }
  /** end of a betting round: every bet slides into the pot, `bets` as they stood. */
  | { kind: "collect"; bets: { seat: number; amount: number }[] }
  /** new board cards (indexes into hand.board). */
  | { kind: "board"; from: number; to: number }
  /** hands turned over at showdown, in order. */
  | { kind: "showdown"; order: number[] }
  /** each pot to its winners, one after the other (`amount` = chips each winner takes). */
  | { kind: "award"; pots: { winners: { seat: number; amount: number }[] }[] }
  /** the 7-2 moment. */
  | { kind: "seven"; seat: number }
  /** a full house or better turned over at the showdown: its own moment before the pot moves. */
  | { kind: "big"; seat: number; title: string }
  /** cards one player showed after the hand turn over where they sit; plays beside whatever is
   *  running (never cuts the end of the hand short). */
  | { kind: "reveal"; seat: number };

export type Cue = CueBody & { id: number };

const sumBets = (hand: HandView) => hand.players.reduce((s, p) => s + p.bet, 0);
const potOf = (hand: HandView) => hand.pots.reduce((s, p) => s + p.amount, 0) + sumBets(hand);

/** Worked out from the table before the action: the state after it may already show the hand
 *  paid out (a call that ends the hand), so stacks after it say nothing about the chips put in. */
function actCue(before: HandView, action: { kind: string; seat: number; amount?: number | null; timeout?: boolean }): CueBody {
  const was = before.players.find((p) => p.seat === action.seat);
  const stack = was?.stack ?? 0;
  const bet = was?.bet ?? 0;
  const call = Math.min(stack, Math.max(0, Math.max(0, ...before.players.map((p) => p.bet)) - bet));
  let move: Move = action.kind === "fold" ? "fold" : action.kind === "check" ? "check" : "call";
  let put = 0;
  if (action.kind === "call") {
    put = call;
    if (stack > 0 && put >= stack) move = "allin";
  } else if (action.kind === "raise") {
    put = Math.min(stack, Math.max(0, (action.amount ?? 0) - bet));
    move = stack > 0 && put >= stack ? "allin" : before.players.some((p) => p.bet > 0) ? "raise" : "bet";
  }
  return { kind: "act", seat: action.seat, move, put, call, pot: potOf(before), timeout: !!action.timeout };
}

/** Bets as they stood when the round closed: the last actor's chips added to its previous bet. */
function closingBets(prev: HandView, next: HandView, actorSeat: number | null) {
  return prev.players
    .map((p) => {
      let amount = p.bet;
      if (p.seat === actorSeat) {
        const after = next.players.find((q) => q.seat === p.seat);
        if (after) amount = p.bet + Math.max(0, p.stack - after.stack - after.bet);
      }
      return { seat: p.seat, amount };
    })
    .filter((b) => b.amount > 0);
}

export function cuesFor(prev: TableState, event: StateEvent): CueBody[] {
  const before = prev.hand;
  switch (event.type) {
    case "hand.started":
      return [{ kind: "deal", order: dealOrder(event.payload.hand) }];
    case "action.applied": {
      if (!before || before.hand_id !== event.hand_id) return [];
      const { action, hand } = event.payload;
      const cues: CueBody[] = [actCue(before, action)];
      if (action.kind === "fold") cues.push({ kind: "fold", seat: action.seat });
      const roundClosed = hand.board.length > before.board.length || (sumBets(before) > 0 && sumBets(hand) === 0);
      if (roundClosed) {
        const bets = closingBets(before, hand, action.kind === "call" || action.kind === "raise" ? action.seat : null);
        if (bets.length) cues.push({ kind: "collect", bets });
      } else if (action.kind === "call" || action.kind === "raise") {
        cues.push({ kind: "bet", seat: action.seat });
      }
      if (hand.board.length > before.board.length) cues.push({ kind: "board", from: before.board.length, to: hand.board.length });
      return cues;
    }
    case "hand.completed": {
      if (!before || before.hand_id !== event.hand_id) return [];
      const { hand, results, seven_deuce } = event.payload;
      const cues: CueBody[] = [];
      const bets = before.complete ? [] : before.players.filter((p) => p.bet > 0).map((p) => ({ seat: p.seat, amount: p.bet }));
      if (bets.length) cues.push({ kind: "collect", bets });
      if (hand.board.length > before.board.length) cues.push({ kind: "board", from: before.board.length, to: hand.board.length });
      const turned = hand.players
        .filter((p) => p.cards.length > 0 && p.cards.every((c) => c !== "??"))
        .filter((p) => before.players.find((q) => q.seat === p.seat)?.cards.some((c) => c === "??"))
        .map((p) => p.seat);
      if (turned.length && !seven_deuce) {
        const order = showdownOrder(hand).filter((s) => turned.includes(s));
        cues.push({ kind: "showdown", order });
      }
      // Any shown hand counts, mine included (my cards were never face down to me).
      const big = seven_deuce ? null : biggestHand(event.payload.showdown);
      if (big) cues.push({ kind: "big", seat: big.seat, title: bigHandTitle(big)! });
      // Pots as they stood before the payout (the completed hand reports them emptied). When the
      // last fold already paid them out, each winner's gain stands in for the pot.
      const winners = results.filter((r) => r.hand_net > 0);
      const pots = before.pots
        .map((pot, i) => {
          const amount = pot.amount + (i === before.pots.length - 1 ? sumBets(before) : 0);
          const takers = winners.filter((w) => pot.eligible.includes(w.player_id));
          return { winners: takers.map((w) => ({ seat: w.seat, amount: Math.round(amount / takers.length) })) };
        })
        .filter((p) => p.winners.length > 0 && p.winners.every((w) => w.amount > 0));
      if (pots.length) cues.push({ kind: "award", pots });
      else if (winners.length) cues.push({ kind: "award", pots: [{ winners: winners.map((w) => ({ seat: w.seat, amount: w.hand_net })) }] });
      if (seven_deuce) cues.push({ kind: "seven", seat: seven_deuce.seat });
      return cues;
    }
    default:
      return [];
  }
}
