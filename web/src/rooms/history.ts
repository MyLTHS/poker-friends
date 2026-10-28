// The history screen's numbers: the profit/loss ledger and the hand list (D1 "history").

import type { components } from "@/api/rest";

type Schemas = components["schemas"];
export type SummaryRow = Schemas["RoomSummary"]["players"][number];
export type HandSummary = Schemas["HandSummary"];

export function ledgerTotals(rows: SummaryRow[]) {
  const sum = (key: "granted" | "balance" | "net") => rows.reduce((a, r) => a + r[key], 0);
  const net = sum("net");
  // The server's ledger always nets to 0 (chips only move between players); say so when it does.
  return { granted: sum("granted"), balance: sum("balance"), net, balanced: net === 0 };
}

/** Width of a net bar as a percentage of half the bar (the axis sits in the middle). */
export function netBarWidth(net: number, rows: Pick<SummaryRow, "net">[]): number {
  const max = Math.max(0, ...rows.map((r) => Math.abs(r.net)));
  return max === 0 ? 0 : (Math.abs(net) / max) * 50;
}

export const withPlayer = (hands: HandSummary[], playerId: string | null) =>
  playerId === null ? [] : hands.filter((h) => h.players.some((p) => p.player_id === playerId));

/** "21:04" in the viewer's clock. */
export const clock = (iso: string) => new Date(iso).toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit", hour12: false });

/** The hand list starts with this many and opens up by as many more. */
export const HANDS_PAGE = 10;
