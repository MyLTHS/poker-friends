// The hand log of the side panel ("Nhật ký"), built from the state events this connection saw.
// A snapshot carries no history, so the log starts when you join. Entries keep seats, not names:
// names are looked up when drawn.

import type { AppliedAction, TableState } from "@/api/protocol";

import type { StateEvent } from "./reducer";
import { blindSeats } from "./seatView";

export type LogEntry =
  | { kind: "hand"; handNo: number; button: number; sb: number; bb: number; small: number; big: number }
  | { kind: "action"; action: AppliedAction }
  | { kind: "street"; name: "Flop" | "Turn" | "River"; cards: string[] }
  | { kind: "show"; seat: number; cards: string[] }
  | { kind: "win"; seat: number; amount: number }
  | { kind: "seven"; seat: number; total: number; bonus: number; payers: number }
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
      return [{ kind: "hand", handNo: hand.hand_no, button: hand.button_seat, sb, bb, small: hand.small_blind, big: hand.big_blind }];
    }
    case "action.applied":
      return [{ kind: "action", action: event.payload.action }, ...streets(prev.hand?.board ?? [], event.payload.hand.board)];
    case "hand.completed": {
      const { hand, results, seven_deuce } = event.payload;
      const out: LogEntry[] = streets(prev.hand?.board ?? [], hand.board);
      if (!seven_deuce) {
        for (const p of hand.players) {
          const hidden = prev.hand?.players.find((q) => q.seat === p.seat)?.cards.some((c) => c === "??");
          if (hidden && p.cards.length && p.cards.every((c) => c !== "??")) out.push({ kind: "show", seat: p.seat, cards: p.cards });
        }
      }
      for (const r of results) if (r.hand_net > 0) out.push({ kind: "win", seat: r.seat, amount: r.hand_net });
      if (seven_deuce) {
        out.push({ kind: "show", seat: seven_deuce.seat, cards: seven_deuce.cards });
        out.push({ kind: "seven", seat: seven_deuce.seat, total: seven_deuce.total, bonus: seven_deuce.bonus, payers: seven_deuce.payments.length });
      }
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
