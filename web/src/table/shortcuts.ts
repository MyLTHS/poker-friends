// Table keyboard (desktop): which command a key press means. Pure, so it is tested without a page.
// The bar decides nothing here: every action is only offered when legal_actions allows it, and
// the raise amount is moved by the bar's own clamp into [min_raise_to, max_raise_to].
import type { LegalActions } from "@/api/protocol";

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

/** Keys that work any time on the table (my turn or not). */
export function globalCommand(e: KeyLike): ShortcutCommand | null {
  if (e.ctrlKey || e.metaKey || e.altKey) return null;
  if (e.key === "?") return { kind: "help" };
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
