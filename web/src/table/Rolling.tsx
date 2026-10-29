"use client";

// A chip count that rolls to its new value (stacks, the pot) instead of jumping, so a win reads
// as chips coming in. Only this text re-renders while it rolls; reduced motion or a hidden tab
// jumps straight to the value.
import { useEffect, useRef, useState } from "react";

import { fmt, prefersReducedMotion } from "@/ui";

const UP_MS = 900;
const DOWN_MS = 380;

export function Rolling({ value }: { value: number }) {
  const [shown, setShown] = useState(value);
  const at = useRef(value); // the number on screen right now
  useEffect(() => {
    const start = at.current;
    if (start === value) return;
    const ms = prefersReducedMotion() || document.hidden ? 0 : value > start ? UP_MS : DOWN_MS;
    const t0 = performance.now();
    let frame = 0;
    const step = (now: number) => {
      const k = ms > 0 ? Math.min(1, (now - t0) / ms) : 1;
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
