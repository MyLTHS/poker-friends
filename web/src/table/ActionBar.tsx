"use client";

// The bottom bar of the desktop table and the right column of the landscape phone (design
// table.tsx TurnBar / IdleBar / TurnPanel). Every button and every bet size comes from the
// server's legal_actions: the bar never decides what is legal, it only clamps a typed amount into
// [min_raise_to, max_raise_to]. Animations never block it: a click is sent at once.
import { useCallback, useEffect, useState, type KeyboardEvent, type ReactNode } from "react";
import { Minus, Plus } from "lucide-react";

import type { LegalActions } from "@/api/protocol";
import { fmt } from "@/ui";

import { Countdown, LiveBar, type TurnClock } from "./clock";
import type { Device } from "./geometry";
import type { Preset } from "./seatView";
import { isTyping, ownsArrows, turnCommand } from "./shortcuts";

export type ActKind = "fold" | "check" | "call" | "raise";

export type TurnProps = {
  device: Device;
  legal: LegalActions;
  presets: Preset[];
  /** Step of the − / + buttons (the big blind). */
  step: number;
  /** Somebody has bet this street: the raise button says "Tố", otherwise "Cược". */
  facingBet: boolean;
  clock?: TurnClock;
  enabled: boolean;
  /** single-key shortcuts on (desktop; the table settings can turn them off) */
  keys?: boolean;
  onAct: (kind: ActKind, amount?: number) => void;
};

const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, Math.round(v)));

/** The raise amount being chosen, starting at the minimum raise. The parent remounts this (key) for
 *  every new decision, so it never carries an old amount into a new street. */
function useRaise(legal: LegalActions) {
  const min = legal.min_raise_to ?? 0;
  const max = Math.max(min, legal.max_raise_to ?? 0);
  const [amount, setAmount] = useState(min);
  const set = useCallback((v: number) => setAmount(clamp(v, min, max)), [min, max]);
  return { min, max, amount: clamp(amount, min, max), set };
}

function Slider({ raise, step, device, keys = false }: { raise: ReturnType<typeof useRaise>; step: number; device: Device; keys?: boolean }) {
  const frac = raise.max > raise.min ? (raise.amount - raise.min) / (raise.max - raise.min) : 1;
  const ic = device === "desktop" ? 14 : 16;
  return (
    <>
      <button type="button" className="step-btn" aria-label="Giảm mức tố" aria-keyshortcuts={keys ? "ArrowDown" : undefined} onClick={() => raise.set(raise.amount - step)} disabled={raise.amount <= raise.min}>
        <Minus size={ic} strokeWidth={2.2} />
      </button>
      <span className="slider">
        <span className="slider-fill" style={{ width: `${frac * 100}%` }} />
        <span className="slider-thumb" style={{ left: `${frac * 100}%` }} />
        <span className="slider-min">{fmt(raise.min)}</span>
        <span className="slider-max">{fmt(raise.max)}</span>
        <input
          type="range"
          className="slider-input"
          min={raise.min}
          max={raise.max}
          step={1}
          value={raise.amount}
          onChange={(e) => raise.set(Number(e.target.value))}
          aria-label="Mức tố"
          aria-valuetext={`${fmt(raise.amount)} chip`}
        />
      </span>
      <button type="button" className="step-btn" aria-label="Tăng mức tố" aria-keyshortcuts={keys ? "ArrowUp" : undefined} onClick={() => raise.set(raise.amount + step)} disabled={raise.amount >= raise.max}>
        <Plus size={ic} strokeWidth={2.2} />
      </button>
    </>
  );
}

function AmountBox({ raise }: { raise: ReturnType<typeof useRaise> }) {
  const [text, setText] = useState<string | null>(null);
  const commit = () => {
    if (text !== null && text.trim() !== "") raise.set(Number(text.replace(/\D/g, "")));
    setText(null);
  };
  return (
    <input
      className="amount-box"
      inputMode="numeric"
      aria-label="Số chip tố"
      value={text ?? fmt(raise.amount)}
      onFocus={(e) => {
        setText(String(raise.amount));
        requestAnimationFrame(() => e.target.select());
      }}
      onChange={(e) => setText(e.target.value)}
      onBlur={commit}
      onKeyDown={(e: KeyboardEvent<HTMLInputElement>) => e.key === "Enter" && e.currentTarget.blur()}
    />
  );
}

function Presets({ presets, raise, className, keys = false }: { presets: Preset[]; raise: ReturnType<typeof useRaise>; className: string; keys?: boolean }) {
  return (
    <div className={className} role="group" aria-label="Mức tố nhanh">
      {presets.map((p, i) => (
        <button key={p.label} type="button" className={`preset${p.amount === raise.amount ? " is-active" : ""}`} onClick={() => raise.set(p.amount)} aria-pressed={p.amount === raise.amount} aria-keyshortcuts={keys ? String(i + 1) : undefined}>
          <span>{p.label}</span>
          <b>{fmt(p.amount)}</b>
        </button>
      ))}
    </div>
  );
}

function Acts({ legal, raise, facingBet, enabled, keys = false, onAct }: { legal: LegalActions; raise: ReturnType<typeof useRaise>; facingBet: boolean; enabled: boolean; keys?: boolean; onAct: TurnProps["onAct"] }) {
  const hint = (k: string) => (keys ? k : undefined);
  const canRaise = legal.min_raise_to !== null && legal.max_raise_to !== null;
  const allIn = canRaise && raise.amount === raise.max;
  return (
    <>
      {legal.can_fold && (
        <button type="button" className="act act-fold" disabled={!enabled} onClick={() => onAct("fold")} aria-keyshortcuts={hint("F")}>
          <span>Bỏ</span>
        </button>
      )}
      {legal.can_check ? (
        <button type="button" className="act act-call" disabled={!enabled} onClick={() => onAct("check")} aria-keyshortcuts={hint("C")}>
          <span>Check</span>
        </button>
      ) : (
        legal.call_amount > 0 && (
          <button type="button" className="act act-call" disabled={!enabled} onClick={() => onAct("call")} aria-keyshortcuts={hint("C")}>
            <span>Theo</span>
            <b>{fmt(legal.call_amount)}</b>
          </button>
        )
      )}
      {canRaise && (
        <button type="button" className="act act-raise" disabled={!enabled} onClick={() => onAct("raise", raise.amount)} aria-keyshortcuts={hint("R")}>
          <span>{allIn ? "All-in" : facingBet ? "Tố" : "Cược"}</span>
          <b>{fmt(raise.amount)}</b>
        </button>
      )}
    </>
  );
}

/** Keyboard on the desktop (shortcuts.ts): F fold, C check/call, R raise, 1–4 quick sizes, arrows
 *  move the amount. Off while typing, while a dialog or the help is open, and for held-down keys. */
function useShortcuts(enabled: boolean, legal: LegalActions, presets: Preset[], step: number, raise: ReturnType<typeof useRaise>, onAct: TurnProps["onAct"]) {
  const { amount, set } = raise;
  useEffect(() => {
    if (!enabled) return;
    const onKey = (e: globalThis.KeyboardEvent) => {
      if (e.defaultPrevented || isTyping(e.target) || document.querySelector("dialog[open]")) return;
      // tabs, radio groups and the slider move with their own arrow keys
      if (e.key.startsWith("Arrow") && ownsArrows(e.target)) return;
      const cmd = turnCommand(e, legal, presets.length);
      if (!cmd) return;
      e.preventDefault();
      if (cmd.kind === "nudge") return set(amount + cmd.steps * step);
      if (cmd.kind === "preset") return set(presets[cmd.index].amount);
      if (e.repeat) return;
      if (cmd.kind === "raise") onAct("raise", amount);
      else if (cmd.kind === "fold" || cmd.kind === "check" || cmd.kind === "call") onAct(cmd.kind);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [enabled, legal, presets, step, amount, set, onAct]);
}

const timeoutNote = (legal: LegalActions, short: boolean) =>
  legal.can_check ? (short ? "Hết giờ tự check" : "Hết giờ sẽ tự check") : short ? "Hết giờ tự bỏ bài" : "Hết giờ sẽ tự bỏ bài";

/** Desktop: my turn. */
export function TurnBar(props: TurnProps) {
  const { legal, presets, step, facingBet, clock, enabled, keys = false, onAct } = props;
  const raise = useRaise(legal);
  useShortcuts(enabled && keys, legal, presets, step, raise, onAct);
  const canRaise = legal.min_raise_to !== null;
  return (
    <div className="abar" role="region" aria-label="Tới lượt bạn">
      <div className="abar-status">
        <span className="abar-eyebrow">Tới lượt bạn</span>
        {clock && (
          <span className="abar-clock" role="timer" aria-live="off">
            <b>
              <Countdown deadline={clock.deadline} frozenAt={clock.frozenAt} />
            </b>
            <small>giây</small>
          </span>
        )}
        {clock && <LiveBar clock={clock} />}
        <span className="abar-note">{timeoutNote(legal, false)}</span>
      </div>
      <div className="abar-main">
        <Acts legal={legal} raise={raise} facingBet={facingBet} enabled={enabled} keys={keys} onAct={onAct} />
      </div>
      {canRaise && (
        <div className="abar-raise">
          <Presets presets={presets} raise={raise} className="presets" keys={keys} />
          <div className="slider-row">
            <Slider raise={raise} step={step} device="desktop" keys={keys} />
            <AmountBox raise={raise} />
          </div>
        </div>
      )}
    </div>
  );
}

/** Phone: my turn in the right column. Clock on top, sizing in the middle, the three actions at the
 *  bottom where the right thumb rests. */
export function TurnPanel(props: TurnProps) {
  const { legal, presets, step, facingBet, clock, enabled, onAct } = props;
  const raise = useRaise(legal);
  const canRaise = legal.min_raise_to !== null;
  return (
    <aside className="ppanel tpanel" aria-label="Tới lượt bạn">
      <div className="tp-clock">
        <span className="tp-secs" role="timer">
          <b>{clock ? <Countdown deadline={clock.deadline} frozenAt={clock.frozenAt} /> : "–"}</b>
          <small>giây</small>
        </span>
        <span className="tp-label">
          <span className="abar-eyebrow">Tới lượt bạn</span>
          <small>{timeoutNote(legal, true)}</small>
        </span>
        {clock && <LiveBar clock={clock} />}
      </div>
      {canRaise && <Presets presets={presets} raise={raise} className="presets-m" />}
      {canRaise && (
        <div className="slider-row">
          <Slider raise={raise} step={step} device="mobile" />
        </div>
      )}
      <div className="tp-acts">
        <Acts legal={legal} raise={raise} facingBet={facingBet} enabled={enabled} onAct={onAct} />
      </div>
    </aside>
  );
}

export function IdleBar({ left, center, right, className = "" }: { left?: ReactNode; center: ReactNode; right?: ReactNode; className?: string }) {
  return (
    <div className={`abar abar-idle ${className}`}>
      <div className="idle-left">{left}</div>
      <div className="idle-center">{center}</div>
      <div className="idle-right">{right}</div>
    </div>
  );
}

/** A checkbox-looking toggle of the bar ("Nghỉ ván sau"). */
export function PreAction({ label, on = false, onToggle, disabled }: { label: string; on?: boolean; onToggle?: () => void; disabled?: boolean }) {
  return (
    <button type="button" className={`pre${on ? " is-on" : ""}`} aria-pressed={on} onClick={onToggle} disabled={disabled}>
      <i aria-hidden />
      {label}
    </button>
  );
}
