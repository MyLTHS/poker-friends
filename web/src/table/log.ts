// The hand log of the side panel ("Nhật ký"), built from the state events this connection saw.
// A snapshot carries no history, so the log starts when you join. Entries keep seats, not names:
// names are looked up when drawn.

import type { AppliedAction, TableState } from "@/api/protocol";

import { showdownBySeat } from "./handName";
import type { StateEvent } from "./reducer";
import { blindSeats } from "./seatView";

export type LogEntry =
  | { kind: "hand"; handNo: number; button: number; sb: number; bb: number; small: number; big: number; ante: number; bomb: number }
  | { kind: "action"; action: AppliedAction }
  | { kind: "street"; name: "Flop" | "Turn" | "River"; cards: string[] }
  | { kind: "show"; seat: number; cards: string[]; hand?: string }
  | { kind: "muck"; seat: number }
  | { kind: "win"; seat: number; amount: number }
  | { kind: "seven"; seat: number; total: number; bonus: number; payers: number }
  /** The hand was run twice: board `n` (1 or 2) and who it paid (no amount: took every board). */
  | { kind: "runout"; n: number; cards: string[]; winners: { seat: number; amount?: number }[] }
  /** Rabbit hunt: the board cards that would have come (no chips moved). */
  | { kind: "rabbit"; cards: string[] }
  /** Cards shown after the hand (cards.shown). */
  | { kind: "reveal"; seat: number; cards: string[] }
  | { kind: "warn"; text: string };

export const LOG_KEPT = 80;

const STREETS: Record<number, "Flop" | "Turn" | "River"> = { 3: "Flop", 4: "Turn", 5: "River" };

function streets(before: string[], after: string[]): LogEntry[] {
  const out: LogEntry[] = [];
  for (const n of [3, 4, 5]) {
    if (before.length < n && after.length >= n) out.push({ kind: "street", name: STREETS[n], cards: n === 3 ? after.slice(0, 3) : [after[n - 1]] });
  }
  return out;
}

export function logFor(prev: TableState, event: StateEvent): LogEntry[] {
  switch (event.type) {
    case "hand.started": {
      const hand = event.payload.hand;
      const { sb, bb } = blindSeats(hand);
      return [{ kind: "hand", handNo: hand.hand_no, button: hand.button_seat, sb, bb, small: hand.small_blind, big: hand.big_blind, ante: hand.ante, bomb: hand.bomb_pot }];
    }
    case "action.applied": {
      // A hand run twice is dealt out at once: hand.completed logs both boards whole (runout).
      const twice = !!event.payload.hand.second_board;
      return [{ kind: "action", action: event.payload.action }, ...(twice ? [] : streets(prev.hand?.board ?? [], event.payload.hand.board))];
    }
    case "hand.completed": {
      const { hand, results, seven_deuce, showdown, runouts, rabbit_cards } = event.payload;
      // Run twice: two whole boards, each with who it paid, instead of the streets. A board comes
      // without winners when one player took them all (the others mucked): the hand's winners.
      const scooped = results.filter((r) => r.hand_net > 0).map((r) => ({ seat: r.seat }));
      const out: LogEntry[] = runouts
        ? runouts.map((r, i) => ({ kind: "runout", n: i + 1, cards: [...r.board], winners: r.winners.length ? r.winners.map((w) => ({ seat: w.seat, amount: w.amount })) : scooped }))
        : streets(prev.hand?.board ?? [], hand.board);
      // The server names every hand still face up after a showdown (once per board when run
      // twice); whoever else reached it mucked.
      const names = showdownBySeat(showdown);
      for (const entry of showdown) {
        if (out.some((e) => e.kind === "show" && e.seat === entry.seat)) continue;
        const cards = hand.players.find((p) => p.seat === entry.seat)?.cards ?? [];
        out.push({ kind: "show", seat: entry.seat, cards, hand: names[entry.seat] });
      }
      if (showdown.length) {
        for (const p of prev.hand?.players ?? []) {
          if (p.in_hand && !showdown.some((entry) => entry.seat === p.seat)) out.push({ kind: "muck", seat: p.seat });
        }
      }
      for (const r of results) if (r.hand_net > 0) out.push({ kind: "win", seat: r.seat, amount: r.hand_net });
      if (seven_deuce) {
        out.push({ kind: "show", seat: seven_deuce.seat, cards: seven_deuce.cards });
        out.push({ kind: "seven", seat: seven_deuce.seat, total: seven_deuce.total, bonus: seven_deuce.bonus, payers: seven_deuce.payments.length });
      }
      if (rabbit_cards?.length) out.push({ kind: "rabbit", cards: rabbit_cards });
      return out;
    }
    case "seat.updated": {
      const before = prev.seats.find((s) => s.seat === event.payload.seat);
      const after = event.payload.occupant;
      if (before && after && before.connected && !after.connected) return [{ kind: "warn", text: `${after.display_name} mất kết nối — đồng hồ vẫn chạy` }];
      if (before && after && !before.connected && after.connected) return [{ kind: "warn", text: `${after.display_name} đã kết nối lại` }];
      if (!before && after) return [{ kind: "warn", text: `${after.display_name} ngồi ghế ${after.seat}` }];
      if (before && !after) return [{ kind: "warn", text: `${before.display_name} rời bàn` }];
      return [];
    }
    case "room.suspended":
      return [{ kind: "warn", text: "Bàn tạm dừng để khôi phục" }];
    default:
      return [];
  }
}
