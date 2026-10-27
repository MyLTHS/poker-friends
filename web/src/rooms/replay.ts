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
