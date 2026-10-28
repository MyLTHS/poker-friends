// Words for one replay step (GET /api/hands/{id}/replay/).

import type { AppliedAction } from "@/api/protocol";

const VERB: Record<AppliedAction["kind"], string> = {
  fold: "bỏ bài",
  check: "check",
  call: "theo",
  raise: "tố lên",
};

export function describeStep(action: AppliedAction | null, names: Record<string, string>): string {
  if (action === null) return "Chia bài";
  const who = names[action.player_id] ?? `Ghế ${action.seat}`;
  const amount = action.kind === "raise" ? ` ${action.amount}` : "";
  return `${who} ${VERB[action.kind]}${amount}${action.timeout ? " (hết giờ)" : ""}`;
}

type Listed = { hand_id: number; hand_no: number; voided: boolean };

/** The replayable hands just before (older) and after (newer) `handId` in the room's hand list. */
export function neighbours<H extends Listed>(hands: H[], handId: number): { prev: H | null; next: H | null } {
  const playable = hands.filter((h) => !h.voided || h.hand_id === handId).sort((a, b) => a.hand_no - b.hand_no);
  const i = playable.findIndex((h) => h.hand_id === handId);
  if (i < 0) return { prev: null, next: null };
  return { prev: playable[i - 1] ?? null, next: playable[i + 1] ?? null };
}
