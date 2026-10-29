// A room's rules (blinds, starting stack, seats, think time, 7-2 bonus, ante, bomb pot, visibility):
// the create form, its preview, the owner's "change the rules" form, and the server's field errors
// in Vietnamese.

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
  /** dead money everyone dealt in puts in before the blinds; 0 = no ante */
  ante: number;
  /** every Nth hand is a bomb pot (everyone puts in bomb_pot_amount, no blinds, no preflop
   *  betting); 0 = never */
  bomb_pot_every: number;
  bomb_pot_amount: number;
  is_private: boolean;
};

/** Same cap as the server (apps/games/models.py MAX_STARTING_STACK). */
export const MAX_STARTING_STACK = 10_000_000;

/** Same caps as the server (apps/games/rooms.py SETTING_RULES): ante and bomb pot amount as the
 *  starting stack, bomb pot every 1 to 1.000 hands. */
export const MAX_ANTE = MAX_STARTING_STACK;
export const MAX_BOMB_EVERY = 1000;

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

/** The bomb pot a big blind suggests: 2 of them, capped. NaN for no blind. */
export const defaultBombAmount = (bigBlind: number) =>
  Number.isInteger(bigBlind) && bigBlind > 0 ? Math.min(2 * bigBlind, MAX_STARTING_STACK) : NaN;

/** The create form's "Mỗi người góp" box: what the player typed (`typed`, null when untouched),
 *  else 2 big blinds of the blind being typed, so it follows the big blind ("" without one). */
export function bombAmountText(typed: string | null, bigBlind: string): string {
  if (typed !== null) return typed;
  const amount = defaultBombAmount(bigBlind.trim() === "" ? NaN : Number(bigBlind));
  return Number.isNaN(amount) ? "" : String(amount);
}

export const SEAT_CHOICES = [2, 3, 4, 5, 6, 7, 8, 9];
export const THINK_CHOICES = [15, 20, 30, 45, 60];
export const SEVEN_CHOICES = [25, 50, 100];

/** What a new room gets unless changed: 10/20, 2.000 chips each, 9 seats, 20 s, no 7-2 bonus,
 *  no ante, no bomb pot, public (shown in the lobby). */
export const DEFAULT_RULES: Rules = {
  name: "",
  small_blind: 10,
  big_blind: 20,
  max_seats: 9,
  think_time_seconds: 20,
  seven_deuce_bonus: 0,
  starting_stack: 2000,
  ante: 0,
  bomb_pot_every: 0,
  bomb_pot_amount: 0,
  is_private: false,
};

/** The bonus the 7-2 box starts at once the player switches the bonus on. */
export const SEVEN_DEFAULT = 50;

/** How often a bomb pot comes once the player switches it on: every 5th hand. */
export const BOMB_EVERY_DEFAULT = 5;

/** The create form keeps what the player typed (an empty box stays empty); `draftRules()` reads it.
 *  `name` null: not touched yet, the box shows "Bàn của <tên>"; `starting` null: not touched yet,
 *  the box follows the big blind (100 of them, like the server's default); `bombAmount` null: the
 *  same, 2 big blinds. An empty ante box means no ante. */
export type RoomDraft = {
  name: string | null;
  small_blind: string;
  big_blind: string;
  starting: string | null;
  max_seats: number;
  think_time_seconds: number;
  sevenOn: boolean;
  seven: string;
  ante: string;
  bombOn: boolean;
  bombEvery: string;
  bombAmount: string | null;
  is_private: boolean;
};

/** A fresh create form: the 7-2 switch off (its box waits at 50), no ante, the bomb pot switch off
 *  (every 5 hands, 2 big blinds once on), the room public. */
export const NEW_ROOM_DRAFT: RoomDraft = {
  name: null,
  small_blind: String(DEFAULT_RULES.small_blind),
  big_blind: String(DEFAULT_RULES.big_blind),
  starting: null,
  max_seats: DEFAULT_RULES.max_seats,
  think_time_seconds: DEFAULT_RULES.think_time_seconds,
  sevenOn: DEFAULT_RULES.seven_deuce_bonus > 0,
  seven: String(DEFAULT_RULES.seven_deuce_bonus || SEVEN_DEFAULT),
  ante: String(DEFAULT_RULES.ante),
  bombOn: DEFAULT_RULES.bomb_pot_every > 0,
  bombEvery: String(DEFAULT_RULES.bomb_pot_every || BOMB_EVERY_DEFAULT),
  bombAmount: null,
  is_private: DEFAULT_RULES.is_private,
};

const num = (text: string) => (text.trim() === "" ? NaN : Number(text));

/** What the create form sends for `draft` (the 7-2 bonus and the bomb pot are 0 while their
 *  switch is off). */
export function draftRules(draft: RoomDraft, name: string): Rules {
  return {
    name,
    small_blind: num(draft.small_blind),
    big_blind: num(draft.big_blind),
    max_seats: draft.max_seats,
    think_time_seconds: draft.think_time_seconds,
    seven_deuce_bonus: draft.sevenOn ? num(draft.seven) : 0,
    starting_stack: num(startingStackText(draft.starting, draft.big_blind)),
    ante: draft.ante.trim() === "" ? 0 : num(draft.ante),
    // switched on, 0 ("never") is not an answer: checkRules asks for 1 to 1.000
    bomb_pot_every: draft.bombOn ? num(draft.bombEvery) || NaN : 0,
    bomb_pot_amount: draft.bombOn ? num(bombAmountText(draft.bombAmount, draft.big_blind)) : 0,
    is_private: draft.is_private,
  };
}

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
  if (!whole(rules.ante) || rules.ante < 0) errors.ante = "Số chip không âm.";
  else if (rules.ante > MAX_ANTE) errors.ante = `Tối đa ${fmt(MAX_ANTE)} chip.`;
  if (!whole(rules.bomb_pot_every) || rules.bomb_pot_every < 0 || rules.bomb_pot_every > MAX_BOMB_EVERY)
    errors.bomb_pot_every = `Từ 1 đến ${fmt(MAX_BOMB_EVERY)} ván.`;
  // the amount only counts while the bomb pot is on (the server: above 0 then)
  else if (rules.bomb_pot_every > 0) {
    if (!whole(rules.bomb_pot_amount) || rules.bomb_pot_amount < 1) errors.bomb_pot_amount = "Ít nhất 1 chip.";
    else if (rules.bomb_pot_amount > MAX_STARTING_STACK) errors.bomb_pot_amount = `Tối đa ${fmt(MAX_STARTING_STACK)} chip.`;
  }
  return errors;
}

/** The server words field errors in English ("Must be between 2 and 9."); players read these. */
export function fieldText(message: string): string {
  if (message === "Required.") return "Cần điền ô này.";
  if (message === "Must be below big_blind.") return "Blind nhỏ phải nhỏ hơn blind lớn.";
  if (message === "bomb_pot_amount must be above 0 while bomb_pot_every is on") return "Ít nhất 1 chip khi bật bomb pot.";
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

export const ruleKeys = ["small_blind", "big_blind", "think_time_seconds", "seven_deuce_bonus", "starting_stack", "ante", "bomb_pot_every", "bomb_pot_amount"] as const;
export type EditableRules = Pick<RoomInfo, (typeof ruleKeys)[number]>;

/** The PATCH body of the owner's rules form: only what changed, so a pending change of another
 *  field (waiting for the next hand) is left alone. Empty = nothing to save. */
export function changedRules(current: EditableRules, edited: EditableRules): UpdateRoomRequest {
  const body: UpdateRoomRequest = {};
  for (const key of ruleKeys) if (edited[key] !== current[key]) body[key] = edited[key];
  return body;
}

/** "bomb pot 40 mỗi 5 ván" ("mọi ván" for every hand), or "tắt bomb pot". */
export function bombText(every: number, amount: number): string {
  if (every <= 0) return "tắt bomb pot";
  return `bomb pot ${fmt(amount)} ${every === 1 ? "mọi ván" : `mỗi ${every} ván`}`;
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
  if (pending.ante !== undefined) parts.push(pending.ante > 0 ? `ante ${fmt(pending.ante)}` : "tắt ante");
  if (pending.bomb_pot_every !== undefined || pending.bomb_pot_amount !== undefined)
    parts.push(bombText(pending.bomb_pot_every ?? room.bomb_pot_every, pending.bomb_pot_amount ?? room.bomb_pot_amount));
  if (pending.name !== undefined) parts.push(`tên "${pending.name}"`);
  return parts.length ? `Ván sau: ${parts.join(" · ")}` : null;
}
