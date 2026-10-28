// Where things sit on the D1 table: the design's fixed coordinates (design/c1 table.tsx GEO) for
// the desktop stage (1100×720) and the landscape phone stage (612×390), plus which of those spots
// a 2–9 seat room uses. Pure; the stage is scaled as a whole (TableStage), so these stay in design
// pixels.

export type Device = "desktop" | "mobile";
export type Pt = { x: number; y: number };

type Geo = {
  w: number;
  h: number;
  c: Pt;
  oval: { l: number; t: number; w: number; h: number };
  board: Pt;
  cardW: number;
  pot: Pt;
  mark: Pt;
  /** Spots 1–9 are the design's; 10 (top centre) is ours, for 2, 4, 6 and 8 seat rooms. */
  spots: Record<number, Pt>;
  meBet: Pt;
  dealer: { k: number; r: number; sign: 1 | -1 };
  /** The button beside my own seat (the formula would hide it under my cards). */
  meDealer: Pt;
  /** Spot 1 when it is someone else's seat (I watch): spot 1 is drawn for my big cards and plate,
   *  an ordinary seat there would hang below the frame. */
  pod1: Pt;
};

export const GEO: Record<Device, Geo> = {
  desktop: {
    w: 1100,
    h: 720,
    c: { x: 550, y: 325 },
    oval: { l: 140, t: 120, w: 820, h: 410 },
    board: { x: 550, y: 325 },
    cardW: 66,
    pot: { x: 550, y: 230 },
    mark: { x: 550, y: 410 },
    spots: {
      1: { x: 550, y: 655 },
      2: { x: 262, y: 560 },
      3: { x: 76, y: 330 },
      4: { x: 205, y: 128 },
      5: { x: 430, y: 62 },
      6: { x: 670, y: 62 },
      7: { x: 895, y: 128 },
      8: { x: 1024, y: 330 },
      9: { x: 838, y: 560 },
      10: { x: 550, y: 62 },
    },
    meBet: { x: 550, y: 468 },
    dealer: { k: 0.28, r: 38, sign: 1 },
    meDealer: { x: 438, y: 610 },
    pod1: { x: 550, y: 580 },
  },
  // Spot points are avatar centres, except spot 1 (bottom centre of my cards and plate).
  mobile: {
    w: 612,
    h: 390,
    c: { x: 328, y: 198 },
    oval: { l: 116, t: 94, w: 424, h: 210 },
    board: { x: 328, y: 198 },
    cardW: 40,
    pot: { x: 328, y: 146 },
    mark: { x: 328, y: 238 },
    spots: {
      1: { x: 328, y: 364 },
      2: { x: 162, y: 290 },
      3: { x: 86, y: 192 },
      4: { x: 162, y: 98 },
      5: { x: 268, y: 58 },
      6: { x: 388, y: 58 },
      7: { x: 494, y: 98 },
      8: { x: 570, y: 192 },
      9: { x: 494, y: 290 },
      10: { x: 328, y: 58 },
    },
    meBet: { x: 328, y: 266 },
    dealer: { k: 0.36, r: 32, sign: 1 },
    meDealer: { x: 236, y: 334 },
    pod1: { x: 328, y: 296 },
  },
};

/** Spots used by a room of n seats, clockwise from the bottom centre (my place). */
export const SPOTS_FOR: Record<number, number[]> = {
  2: [1, 10],
  3: [1, 4, 7],
  4: [1, 3, 10, 8],
  5: [1, 3, 4, 7, 8],
  6: [1, 3, 4, 10, 7, 8],
  7: [1, 2, 3, 5, 6, 8, 9],
  8: [1, 2, 3, 4, 10, 7, 8, 9],
  9: [1, 2, 3, 4, 5, 6, 7, 8, 9],
};

/** Spot of server seat `seat` in a room of `maxSeats`: seat numbers go clockwise, and `anchor`
 *  (my seat, or seat 1 for a spectator) sits at the bottom centre. */
export function spotOf(seat: number, maxSeats: number, anchor: number): number {
  const n = Math.min(9, Math.max(2, maxSeats));
  const spots = SPOTS_FOR[n];
  const i = (((seat - anchor) % n) + n) % n;
  return spots[i];
}

export const lerp = (a: Pt, b: Pt, k: number): Pt => ({ x: a.x + (b.x - a.x) * k, y: a.y + (b.y - a.y) * k });

/** Avatar centre of a seat; `me` = my own seat (spot 1 is then the bottom of my cards and plate). */
export const spotPos = (device: Device, spot: number, me = false): Pt =>
  spot === 1 && !me ? GEO[device].pod1 : GEO[device].spots[spot];

/** Where a seat's bet stacks: 42% of the way to the centre (mine has its own place). */
export function betPos(device: Device, spot: number, me = false): Pt {
  const g = GEO[device];
  if (spot === 1 && me) return g.meBet;
  const p = lerp(spotPos(device, spot), g.c, 0.42);
  return { x: Math.round(p.x), y: Math.round(p.y) };
}

/** The dealer button: a little toward the centre from the seat, pushed to its side. */
export function dealerPos(device: Device, spot: number, me = false): Pt {
  const g = GEO[device];
  if (spot === 1 && me) return g.meDealer;
  const s = spotPos(device, spot);
  const v = { x: g.c.x - s.x, y: g.c.y - s.y };
  const len = Math.hypot(v.x, v.y);
  const base = lerp(s, g.c, g.dealer.k);
  const r = g.dealer.r * g.dealer.sign;
  // rounded: Node and the browser may differ in the last digits (hydration)
  return { x: Math.round(base.x - (v.y / len) * r), y: Math.round(base.y + (v.x / len) * r) };
}

/** Scale that fits a stage of the device into a box, never above `max`. */
export function fitScale(device: Device, box: { width: number; height: number }, max = 1.6): number {
  const g = GEO[device];
  if (box.width <= 0 || box.height <= 0) return 1;
  return Math.min(max, box.width / g.w, box.height / g.h);
}
