// Table keyboard (desktop): which command a key press means. Pure, so it is tested without a page.
// The bar decides nothing here: every action is only offered when legal_actions allows it, and
// the raise amount is moved by the bar's own clamp into [min_raise_to, max_raise_to].
import type { LegalActions } from "@/api/protocol";

import { readJson, writeJson } from "./prefs";

export type ShortcutCommand =
  | { kind: "fold" }
  | { kind: "check" }
  | { kind: "call" }
  /** send the raise at the amount the bar shows */
  | { kind: "raise" }
  /** pick a quick size (index into the bar's presets: ½ pot, ¾ pot, Pot, All-in) */
  | { kind: "preset"; index: number }
  /** move the raise amount by this many big blinds */
  | { kind: "nudge"; steps: number }
  | { kind: "help" }
  | { kind: "sound" };

type KeyLike = Pick<KeyboardEvent, "key" | "shiftKey" | "ctrlKey" | "metaKey" | "altKey">;

const KEY = "pf.table.keys";

/** Single-key shortcuts can be turned off (WCAG 2.1.4: a stray key must not fold a hand). On
 *  unless switched off in the table settings. */
export function readKeysOn(store?: Storage | null): boolean {
  const data = readJson(KEY, store) as { on?: unknown } | null;
  return !(data && typeof data === "object" && data.on === false);
}

export function writeKeysOn(on: boolean, store?: Storage | null): void {
  writeJson(KEY, { on }, store);
}

/** One line of the help table: keys as shown, and what they do. */
export const SHORTCUTS: { keys: string[]; text: string }[] = [
  { keys: ["F"], text: "Bỏ bài" },
  { keys: ["C"], text: "Check, hoặc theo" },
  { keys: ["R"], text: "Tố / cược đúng mức đang chọn" },
  { keys: ["1", "2", "3", "4"], text: "Chọn ½ pot, ¾ pot, Pot, All-in" },
  { keys: ["↑", "↓"], text: "Thêm / bớt một big blind (giữ Shift: năm)" },
  { keys: ["M"], text: "Bật / tắt âm thanh" },
  { keys: ["?"], text: "Mở bảng phím tắt này" },
];

const TEXT_INPUTS = new Set(["text", "search", "email", "url", "tel", "password", "number", ""]);

/** True while the person is typing (chat, the amount box…): then no key is a shortcut. */
export function isTyping(target: EventTarget | null): boolean {
  if (!target || typeof (target as HTMLElement).tagName !== "string") return false;
  const el = target as HTMLElement;
  if (el.isContentEditable) return true;
  const tag = el.tagName;
  if (tag === "TEXTAREA" || tag === "SELECT") return true;
  if (tag === "INPUT") return TEXT_INPUTS.has(((el as HTMLInputElement).type ?? "").toLowerCase());
  return false;
}

/** True when the focused control moves with its own arrow keys (tabs, radio groups, sliders,
 *  lists): then the arrows are theirs, not the raise amount's. */
export function ownsArrows(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null;
  if (!el || typeof el.closest !== "function") return false;
  if (el.tagName === "INPUT" && (el as HTMLInputElement).type === "range") return true;
  return !!el.closest("[role=tablist], [role=tab], [role=radiogroup], [role=radio], [role=slider], [role=listbox], [role=menu], [role=menubar], select");
}

/** Keys that work any time on the table (my turn or not). `?` also arrives as Shift + `/` on
 *  some layouts and automation. */
export function globalCommand(e: KeyLike): ShortcutCommand | null {
  if (e.ctrlKey || e.metaKey || e.altKey) return null;
  if (e.key === "?" || (e.key === "/" && e.shiftKey)) return { kind: "help" };
  if (e.key.toLowerCase() === "m") return { kind: "sound" };
  return null;
}

/** Keys of my turn. `presets` = how many quick sizes the bar shows (0 when no raise is legal). */
export function turnCommand(e: KeyLike, legal: LegalActions, presets: number): ShortcutCommand | null {
  if (e.ctrlKey || e.metaKey || e.altKey) return null;
  const canRaise = legal.min_raise_to !== null && legal.max_raise_to !== null;
  const key = e.key.length === 1 ? e.key.toLowerCase() : e.key;
  switch (key) {
    case "f":
      return legal.can_fold ? { kind: "fold" } : null;
    case "c":
      if (legal.can_check) return { kind: "check" };
      return legal.call_amount > 0 ? { kind: "call" } : null;
    case "r":
      return canRaise ? { kind: "raise" } : null;
    case "ArrowUp":
    case "ArrowRight":
      return canRaise ? { kind: "nudge", steps: e.shiftKey ? 5 : 1 } : null;
    case "ArrowDown":
    case "ArrowLeft":
      return canRaise ? { kind: "nudge", steps: e.shiftKey ? -5 : -1 } : null;
  }
  // 1–4: the digit row, with or without Shift on keyboards that need it
  const digit = "1234".indexOf(e.key);
  if (digit >= 0) return canRaise && digit < presets ? { kind: "preset", index: digit } : null;
  return null;
}
