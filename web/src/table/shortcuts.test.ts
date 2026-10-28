import { describe, expect, it } from "vitest";

import type { LegalActions } from "@/api/protocol";

import { globalCommand, isTyping, ownsArrows, readKeysOn, turnCommand, writeKeysOn } from "./shortcuts";

const key = (k: string, mods: Partial<KeyboardEvent> = {}) => ({ key: k, shiftKey: false, ctrlKey: false, metaKey: false, altKey: false, ...mods });

const facing: LegalActions = { can_fold: true, can_check: false, call_amount: 40, min_raise_to: 80, max_raise_to: 1000 };
const free: LegalActions = { can_fold: false, can_check: true, call_amount: 0, min_raise_to: 20, max_raise_to: 500 };
const shoveOrFold: LegalActions = { can_fold: true, can_check: false, call_amount: 300, min_raise_to: null, max_raise_to: null };

describe("turnCommand", () => {
  it("maps F / C / R to the legal actions only", () => {
    expect(turnCommand(key("f"), facing, 4)).toEqual({ kind: "fold" });
    expect(turnCommand(key("F"), free, 4)).toBeNull(); // no fold when checking is free
    expect(turnCommand(key("c"), facing, 4)).toEqual({ kind: "call" });
    expect(turnCommand(key("c"), free, 4)).toEqual({ kind: "check" });
    expect(turnCommand(key("r"), facing, 4)).toEqual({ kind: "raise" });
    expect(turnCommand(key("r"), shoveOrFold, 0)).toBeNull();
  });

  it("picks quick sizes 1–4 only when they exist", () => {
    expect(turnCommand(key("1"), facing, 4)).toEqual({ kind: "preset", index: 0 });
    expect(turnCommand(key("4"), facing, 4)).toEqual({ kind: "preset", index: 3 });
    expect(turnCommand(key("3"), facing, 2)).toBeNull();
    expect(turnCommand(key("1"), shoveOrFold, 4)).toBeNull();
  });

  it("nudges the amount with the arrows, five blinds with Shift", () => {
    expect(turnCommand(key("ArrowUp"), facing, 4)).toEqual({ kind: "nudge", steps: 1 });
    expect(turnCommand(key("ArrowLeft", { shiftKey: true }), facing, 4)).toEqual({ kind: "nudge", steps: -5 });
    expect(turnCommand(key("ArrowDown"), shoveOrFold, 0)).toBeNull();
  });

  it("leaves browser shortcuts alone", () => {
    expect(turnCommand(key("r", { metaKey: true }), facing, 4)).toBeNull();
    expect(turnCommand(key("c", { ctrlKey: true }), facing, 4)).toBeNull();
    expect(globalCommand(key("m", { altKey: true }))).toBeNull();
  });
});

describe("globalCommand", () => {
  it("opens help with ? and toggles sound with M", () => {
    expect(globalCommand(key("?", { shiftKey: true }))).toEqual({ kind: "help" });
    expect(globalCommand(key("/", { shiftKey: true }))).toEqual({ kind: "help" });
    expect(globalCommand(key("/"))).toBeNull();
    expect(globalCommand(key("M"))).toEqual({ kind: "sound" });
    expect(globalCommand(key("f"))).toBeNull();
  });
});

describe("isTyping", () => {
  const el = (tagName: string, extra: Record<string, unknown> = {}) => ({ tagName, isContentEditable: false, ...extra }) as unknown as EventTarget;
  it("is true in text fields, the chat and editable areas", () => {
    expect(isTyping(el("INPUT", { type: "text" }))).toBe(true);
    expect(isTyping(el("INPUT", { type: "" }))).toBe(true);
    expect(isTyping(el("TEXTAREA"))).toBe(true);
    expect(isTyping(el("DIV", { isContentEditable: true }))).toBe(true);
  });
  it("is false on buttons, the page and the raise slider", () => {
    expect(isTyping(el("BUTTON"))).toBe(false);
    expect(isTyping(el("INPUT", { type: "range" }))).toBe(false);
    expect(isTyping(null)).toBe(false);
  });
});

describe("ownsArrows", () => {
  const el = (tagName: string, inside: string | null, type = "") =>
    ({ tagName, type, closest: (sel: string) => (inside && sel.includes(inside) ? {} : null) }) as unknown as EventTarget;
  it("leaves the arrows to tabs, radio groups and sliders", () => {
    expect(ownsArrows(el("BUTTON", "[role=tab]"))).toBe(true);
    expect(ownsArrows(el("BUTTON", "[role=radiogroup]"))).toBe(true);
    expect(ownsArrows(el("INPUT", null, "range"))).toBe(true);
  });
  it("gives them to the raise amount elsewhere", () => {
    expect(ownsArrows(el("BUTTON", null))).toBe(false);
    expect(ownsArrows(el("BODY", null))).toBe(false);
    expect(ownsArrows(null)).toBe(false);
  });
});

describe("keyboard shortcuts switch", () => {
  const memory = () => {
    const data = new Map<string, string>();
    return { getItem: (k: string) => data.get(k) ?? null, setItem: (k: string, v: string) => void data.set(k, v) } as unknown as Storage;
  };
  it("is on by default and remembers being turned off", () => {
    const store = memory();
    expect(readKeysOn(store)).toBe(true);
    writeKeysOn(false, store);
    expect(readKeysOn(store)).toBe(false);
    writeKeysOn(true, store);
    expect(readKeysOn(store)).toBe(true);
  });
  it("stays on when storage is blocked", () => {
    const blocked = {
      getItem: () => {
        throw new Error("SecurityError");
      },
      setItem: () => {
        throw new Error("SecurityError");
      },
    } as unknown as Storage;
    expect(readKeysOn(blocked)).toBe(true);
    expect(() => writeKeysOn(false, blocked)).not.toThrow();
    expect(readKeysOn(null)).toBe(true);
  });
});
