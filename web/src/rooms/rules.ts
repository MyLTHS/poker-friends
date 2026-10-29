// A room's rules (blinds, starting stack, seats, think time, 7-2 bonus, visibility): the create form, its
// preview, the owner's "change the rules" form, and the server's field errors in Vietnamese.

import type { components } from "@/api/rest";

import { fmt } from "@/ui/format";

type Schemas = components["schemas"];
export type RoomInfo = Schemas["RoomInfo"];
export type UpdateRoomRequest = Schemas["UpdateRoomRequest"];

export type Rules = {
  name: string;
  small_blind: number;
  big_blind: number;
  max_seats: number;
  think_time_seconds: number;
  seven_deuce_bonus: number;
  /** chips a seat comes with, and a "Mua thêm" gives back (server default 100 × big blind) */
  starting_stack: number;
  is_private: boolean;
};

/** Same cap as the server (apps/games/models.py MAX_STARTING_STACK). */
export const MAX_STARTING_STACK = 10_000_000;

/** The server's default starting stack for a big blind: 100 of them, capped. NaN for no blind. */
export const defaultStartingStack = (bigBlind: number) =>
  Number.isInteger(bigBlind) && bigBlind > 0 ? Math.min(100 * bigBlind, MAX_STARTING_STACK) : NaN;

/** The create form's "Chip đầu vào" box: what the player typed (`typed`, null when untouched),
 *  else 100 big blinds of the blind being typed, so it follows the big blind ("" without one). */
export function startingStackText(typed: string | null, bigBlind: string): string {
  if (typed !== null) return typed;
  const stack = defaultStartingStack(bigBlind.trim() === "" ? NaN : Number(bigBlind));
  return Number.isNaN(stack) ? "" : String(stack);
}

export const SEAT_CHOICES = [2, 3, 4, 5, 6, 7, 8, 9];
export const THINK_CHOICES = [15, 20, 30, 45, 60];
export const SEVEN_CHOICES = [25, 50, 100];

/** The design's sample room: 10/20, 2.000 chips each, 9 seats, 20 s, 7-2 bonus 50, private. */
export const DEFAULT_RULES: Rules = {
  name: "",
  small_blind: 10,
  big_blind: 20,
  max_seats: 9,
  think_time_seconds: 20,
  seven_deuce_bonus: 50,
  starting_stack: 2000,
  is_private: true,
};

export type FieldErrors = Partial<Record<keyof Rules, string>>;

/** Same limits as the server (apps/games/rooms.py SETTING_RULES), checked before sending. */
export function checkRules(rules: Rules): FieldErrors {
  const errors: FieldErrors = {};
  const whole = (n: number) => Number.isInteger(n);
  if (!rules.name.trim()) errors.name = "Đặt cho phòng một cái tên.";
  else if (rules.name.trim().length > 100) errors.name = "Tên dài tối đa 100 chữ.";
  if (!whole(rules.small_blind) || rules.small_blind < 1) errors.small_blind = "Blind nhỏ ít nhất là 1.";
  else if (!whole(rules.big_blind) || rules.big_blind < 2) errors.small_blind = "Blind lớn ít nhất là 2.";
  else if (rules.small_blind >= rules.big_blind) errors.small_blind = "Blind nhỏ phải nhỏ hơn blind lớn.";
  if (!whole(rules.max_seats) || rules.max_seats < 2 || rules.max_seats > 9) errors.max_seats = "Từ 2 đến 9 ghế.";
  if (!whole(rules.think_time_seconds) || rules.think_time_seconds < 5 || rules.think_time_seconds > 120)
    errors.think_time_seconds = "Từ 5 đến 120 giây.";
  if (!whole(rules.seven_deuce_bonus) || rules.seven_deuce_bonus < 0) errors.seven_deuce_bonus = "Số chip không âm.";
  if (!whole(rules.starting_stack) || rules.starting_stack < 1) errors.starting_stack = "Ít nhất 1 chip.";
  else if (rules.starting_stack > MAX_STARTING_STACK) errors.starting_stack = `Tối đa ${fmt(MAX_STARTING_STACK)} chip.`;
  return errors;
}

/** The server words field errors in English ("Must be between 2 and 9."); players read these. */
export function fieldText(message: string): string {
  if (message === "Required.") return "Cần điền ô này.";
  if (message === "Must be below big_blind.") return "Blind nhỏ phải nhỏ hơn blind lớn.";
  if (/^Must be (int|bool|str)\.$/.test(message)) return "Giá trị không đúng kiểu.";
  const range = /^Must be between (\S+) and (\S+)\.$/.exec(message);
  if (range) return range[2] === "∞" ? `Ít nhất là ${range[1]}.` : `Từ ${range[1]} đến ${range[2]}.`;
  return message;
}

export function serverFieldErrors(fields: Record<string, string[] | undefined> | undefined): FieldErrors {
  const out: FieldErrors = {};
  for (const [key, messages] of Object.entries(fields ?? {})) {
    if (messages?.length) out[key as keyof Rules] = fieldText(messages[0]);
  }
  // The table actor reports a blind pair it refuses as a small_blind error, the form's one slot.
  if (out.big_blind && !out.small_blind) out.small_blind = out.big_blind;
  return out;
}

export const blindsText = (r: Pick<RoomInfo, "small_blind" | "big_blind">) => `${fmt(r.small_blind)}/${fmt(r.big_blind)}`;

/** "10/20 · 9 ghế · 20s · 7-2: 50 · Riêng": the phone preview line and the lobby card meta. */
export function rulesLine(r: Pick<Rules, "small_blind" | "big_blind" | "max_seats" | "think_time_seconds" | "seven_deuce_bonus" | "is_private">) {
  return [
    blindsText(r),
    `${r.max_seats} ghế`,
    `${r.think_time_seconds}s`,
    r.seven_deuce_bonus > 0 ? `7-2: ${fmt(r.seven_deuce_bonus)}` : "Không 7-2",
    r.is_private ? "Riêng" : "Công khai",
  ].join(" · ");
}

/** The desktop preview's summary rows. */
export function rulesSummary(r: Rules): [string, string][] {
  return [
    ["Blind", `${fmt(r.small_blind)} / ${fmt(r.big_blind)}`],
    ["Số ghế", r.max_seats === 2 ? "2 ghế · đấu tay đôi" : `${r.max_seats} ghế`],
    ["Suy nghĩ", `${r.think_time_seconds} giây mỗi lượt`],
    ["Thưởng 7-2", r.seven_deuce_bonus > 0 ? `${fmt(r.seven_deuce_bonus)} chip mỗi người` : "Tắt"],
    ["Hiển thị", r.is_private ? "Riêng — chỉ có link" : "Công khai — hiện trong sảnh"],
  ];
}

export const ruleKeys = ["small_blind", "big_blind", "think_time_seconds", "seven_deuce_bonus", "starting_stack"] as const;
export type EditableRules = Pick<RoomInfo, (typeof ruleKeys)[number]>;

/** The PATCH body of the owner's rules form: only what changed, so a pending change of another
 *  field (waiting for the next hand) is left alone. Empty = nothing to save. */
export function changedRules(current: EditableRules, edited: EditableRules): UpdateRoomRequest {
  const body: UpdateRoomRequest = {};
  for (const key of ruleKeys) if (edited[key] !== current[key]) body[key] = edited[key];
  return body;
}

/** "Ván sau: blind 20/40 · 15 giây": what the server keeps for the next hand. */
export function pendingText(pending: UpdateRoomRequest | null | undefined, room: RoomInfo): string | null {
  if (!pending) return null;
  const parts: string[] = [];
  if (pending.small_blind !== undefined || pending.big_blind !== undefined)
    parts.push(`blind ${blindsText({ small_blind: pending.small_blind ?? room.small_blind, big_blind: pending.big_blind ?? room.big_blind })}`);
  if (pending.think_time_seconds !== undefined) parts.push(`${pending.think_time_seconds} giây`);
  if (pending.seven_deuce_bonus !== undefined) parts.push(pending.seven_deuce_bonus > 0 ? `7-2: ${fmt(pending.seven_deuce_bonus)}` : "tắt 7-2");
  if (pending.starting_stack !== undefined) parts.push(`chip đầu vào ${fmt(pending.starting_stack)}`);
  if (pending.name !== undefined) parts.push(`tên "${pending.name}"`);
  return parts.length ? `Ván sau: ${parts.join(" · ")}` : null;
}
