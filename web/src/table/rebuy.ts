// "Mua thêm" (POST /api/rooms/<id>/rebuy/): a seat comes with the room's starting stack, so a
// seated player with no chips has lost them all and may take the starting stack again, owner or
// not. The server says no while their chips are still in the running hand (an all-in being
// played) or once the room is closed; the button follows the same rules.

import type { TableState } from "@/api/protocol";

/** I sit with no chips, am not in the hand being played, and the room still deals. */
export function offersRebuy(table: TableState, myStack: number | undefined): boolean {
  const { hand, room, you } = table;
  if (myStack === undefined || myStack > 0 || room.status === "closed") return false;
  const inHand = !!hand && !hand.complete && hand.players.some((p) => p.player_id === you.player_id && p.in_hand);
  return !inHand;
}

/** What the idle bar says to a seated player with no chips. */
export const noChipsText = (canRebuy: boolean) => (canRebuy ? "Hết chip — bấm Mua thêm" : "Hết chip");
