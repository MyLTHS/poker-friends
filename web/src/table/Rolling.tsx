"use client";

// A chip count that rolls up to its new value (stacks, the pot) instead of jumping, so a win reads
// as chips coming in. Only this text re-renders while it rolls, at most ~30 times a second; a
// count going down (a bet) jumps, and so does everything with reduced motion or a hidden tab.
import { useEffect, useRef, useState } from "react";

import { fmt, prefersReducedMotion } from "@/ui";

const UP_MS = 900;
const FRAME_MS = 33;

export function Rolling({ value }: { value: number }) {
  const [shown, setShown] = useState(value);
  const at = useRef(value); // the number on screen right now
  useEffect(() => {
    const start = at.current;
    if (start === value) return;
    const ms = prefersReducedMotion() || document.hidden || value < start ? 0 : UP_MS;
    const t0 = performance.now();
    let frame = 0;
    let last = -Infinity;
    const step = (now: number) => {
      const k = ms > 0 ? Math.min(1, (now - t0) / ms) : 1;
      if (k < 1 && now - last < FRAME_MS) {
        frame = requestAnimationFrame(step);
        return;
      }
      last = now;
      const v = Math.round(start + (value - start) * (1 - (1 - k) ** 3));
      at.current = v;
      setShown(v);
      if (k < 1) frame = requestAnimationFrame(step);
    };
    frame = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frame);
  }, [value]);
  return <>{fmt(shown)}</>;
}
