// The room's house rules on the table: the ante beside the blinds, and bomb pots (every Nth hand
// of the room everyone puts in the same amount, no blinds, no betting before the flop).

import type { HandView, RoomInfo } from "@/api/protocol";
import { fmt } from "@/ui/format";

/** "Blind 10/20 · Ante 5": the stakes in the top bar (no ante: the blinds alone). */
export function stakesText(room: Pick<RoomInfo, "small_blind" | "big_blind" | "ante">): string {
  const blinds = `Blind ${fmt(room.small_blind)}/${fmt(room.big_blind)}`;
  return room.ante > 0 ? `${blinds} · Ante ${fmt(room.ante)}` : blinds;
}

/** The hand on the table is a bomb pot (the server says so in the hand itself). */
export const isBombPot = (hand: Pick<HandView, "bomb_pot"> | null | undefined): boolean => !!hand?.bomb_pot;

/** Hand `handNo` of the room is a bomb pot under its rules as they stand (the server's
 *  TableRuntime.is_bomb_pot). A rules change still waiting may yet change it. */
export function bombPotHand(room: Pick<RoomInfo, "bomb_pot_every" | "bomb_pot_amount">, handNo: number): boolean {
  return room.bomb_pot_every > 0 && room.bomb_pot_amount > 0 && handNo > 0 && handNo % room.bomb_pot_every === 0;
}
