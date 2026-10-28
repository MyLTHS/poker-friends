import type { ReactNode } from "react";

import type { Device, ScreenId } from "./screens";

/** What each design direction (src/directions/<id>/index.tsx) exports as default. */
export type Direction = {
  id: "d1" | "d2" | "d3" | "d4";
  name: string; // Vietnamese, 2–4 words
  tagline: string; // one line
  description: string; // 2–4 sentences: mood, who it suits, strengths and trade-offs
  swatches: { name: string; value: string }[]; // 4–8 key colours
  fonts: string[]; // families used (from index.html)
  /** Render one screen filling exactly FRAME[device] (the caller sets width/height). */
  render: (screen: ScreenId, device: Device) => ReactNode;
};
