"use client";

// Time on the table: the turn clock follows the server's deadline (corrected by the measured
// server/local offset), never the local clock alone; the ring is redrawn every animation frame
// without re-rendering React.
import { useEffect, useMemo, useRef, useState } from "react";

import type { ChatMessage } from "@/api/protocol";

/** Date.now(), refreshed every `intervalMs`. */
export function useNow(intervalMs: number) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);
  return now;
}

/** Whole seconds left before a local-time deadline (ms), never below 0. */
export const secondsLeft = (deadline: number, now: number) => Math.max(0, Math.ceil((deadline - now) / 1000));

/** Seconds left before a local-time deadline, ticking on its own: only this text re-renders, not
 *  the screen around it. `frozenAt` stops it (room suspended). */
export function Countdown({ deadline, frozenAt }: { deadline: number; frozenAt?: number }) {
  const now = useNow(250);
  return <>{frozenAt ?? secondsLeft(deadline, now)}</>;
}

/** Chat lines younger than `ms` by the server's clock (`offsetMs` = server − local). Re-renders only
 *  when a line arrives or ages out, not on a ticker. */
export function useRecent(messages: ChatMessage[], offsetMs: number, ms: number): ChatMessage[] {
  const [now, setNow] = useState(() => Date.now());
  const serverNow = now + offsetMs;
  // the same array between those moments, so what is built from it is not rebuilt
  const recent = useMemo(() => messages.filter((m) => serverNow - Date.parse(m.sent_at) < ms), [messages, serverNow, ms]);
  const next = Math.min(...recent.map((m) => Date.parse(m.sent_at) + ms - serverNow));
  // A new line: read the clock again right away. Then wake up when the oldest bubble expires.
  useEffect(() => {
    const timer = setTimeout(() => setNow(Date.now()), 0);
    return () => clearTimeout(timer);
  }, [messages.length]);
  useEffect(() => {
    if (!Number.isFinite(next)) return;
    const timer = setTimeout(() => setNow(Date.now()), Math.max(50, next));
    return () => clearTimeout(timer);
  }, [next]);
  return recent;
}

export type TurnClock = {
  /** Deadline in local milliseconds (server deadline minus the clock offset). */
  deadline: number;
  /** Think time of the turn, seconds. */
  total: number;
  /** Frozen at this many seconds (the room is suspended): the ring stops. */
  frozenAt?: number;
};

/** The D1 countdown ring (same markup as ui TimerRing) moving smoothly with the deadline. At 5 s
 *  and under it turns red. Reduced motion keeps it running: the ring is information. */
export function LiveRing({ size, clock, gap = 2, stroke = 4 }: { size: number; clock: TurnClock; gap?: number; stroke?: number }) {
  const ring = useRef<SVGSVGElement>(null);
  const fg = useRef<SVGCircleElement>(null);
  const box = size + (gap + stroke) * 2;
  const r = size / 2 + gap + stroke / 2;
  const c = 2 * Math.PI * r;

  useEffect(() => {
    let frame = 0;
    let drawn = -1;
    const draw = () => {
      const left = clock.frozenAt ?? Math.max(0, (clock.deadline - Date.now()) / 1000);
      const frac = clock.total > 0 ? Math.min(1, left / clock.total) : 0;
      // the ring moves a few pixels a second: repaint only when it moved half a pixel
      if (Math.abs(c * frac - drawn) >= 0.5 || left <= 0) {
        drawn = c * frac;
        fg.current?.setAttribute("stroke-dasharray", `${drawn.toFixed(2)} ${c.toFixed(2)}`);
        ring.current?.classList.toggle("is-low", left <= 5);
      }
      if (clock.frozenAt === undefined && left > 0) frame = requestAnimationFrame(draw);
    };
    draw();
    return () => cancelAnimationFrame(frame);
  }, [clock.deadline, clock.total, clock.frozenAt, c]);

  return (
    <svg ref={ring} className="timer-ring" width={box} height={box} viewBox={`0 0 ${box} ${box}`} aria-hidden>
      <circle className="tr-bg" cx={box / 2} cy={box / 2} r={r} strokeWidth={stroke} />
      <circle ref={fg} className="tr-fg" cx={box / 2} cy={box / 2} r={r} strokeWidth={stroke} strokeDasharray={`${c} ${c}`} transform={`rotate(-90 ${box / 2} ${box / 2})`} />
    </svg>
  );
}

/** The thin bar under the action bar's clock, same timing as the ring. */
export function LiveBar({ clock }: { clock: TurnClock }) {
  const bar = useRef<HTMLElement>(null);
  useEffect(() => {
    let frame = 0;
    let drawn = -1;
    const draw = () => {
      const left = clock.frozenAt ?? Math.max(0, (clock.deadline - Date.now()) / 1000);
      const frac = clock.total > 0 ? Math.min(1, left / clock.total) : 0;
      if (bar.current && (Math.abs(frac - drawn) >= 0.002 || left <= 0)) {
        drawn = frac;
        bar.current.style.transform = `scaleX(${frac.toFixed(4)})`;
      }
      if (clock.frozenAt === undefined && left > 0) frame = requestAnimationFrame(draw);
    };
    draw();
    return () => cancelAnimationFrame(frame);
  }, [clock.deadline, clock.total, clock.frozenAt]);
  return (
    <span className="abar-timebar">
      <i ref={bar} style={{ width: "100%", transformOrigin: "left" }} />
    </span>
  );
}
