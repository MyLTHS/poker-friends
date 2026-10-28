// Pure helpers for "Kính & Ánh Kim" (d2): number formatting, avatar jewels, deterministic art.
import type { CSSProperties } from "react";

/** 1460 -> "1.460" (Vietnamese thousands separator). Always unsigned. */
export const fmt = (n: number) => String(Math.abs(Math.round(n))).replace(/\B(?=(\d{3})+(?!\d))/g, ".");

/** +1.130 / −540 / 0 (true minus sign). */
export const signed = (n: number) => (n > 0 ? "+" : n < 0 ? "−" : "") + fmt(n);

/** Tone class for a signed amount: cyan up, warm red down. */
export const tone = (n: number) => (n > 0 ? "up" : n < 0 ? "down" : "flat");

/** Inline CSS custom properties without fighting React's CSSProperties type. */
export const vars = (v: Record<string, string | number>) => v as CSSProperties;

/** Each player gets a jewel: [light, deep] for the avatar gradient. */
const JEWEL: Record<string, [string, string]> = {
  Lym: ["#5AA2FF", "#1C3F93"], // sapphire
  An: ["#F2708F", "#7C1D3D"], // garnet
  Bình: ["#F4C35E", "#8A5A12"], // topaz
  Chi: ["#4FD7AE", "#0E5E4B"], // jade
  Dũng: ["#A98BFF", "#3D2A88"], // amethyst
  Giang: ["#F59A6A", "#7A3416"], // copper
  Hà: ["#EE7FCF", "#6C1F5A"], // orchid
  Khoa: ["#6CC6F4", "#1B4D76"], // steel
  Mai: ["#FFB199", "#8A3B2A"],
  Tùng: ["#9FE07A", "#2E6A1E"],
  Ngọc: ["#7EE3E0", "#14615F"],
};
export const jewel = (name: string): [string, string] => JEWEL[name] ?? ["#9DB0BA", "#34454E"];
export const initial = (name: string) => name.charAt(0).toUpperCase();

/** Small deterministic PRNG (mulberry32) so decoration is identical on every render. */
export function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** A QR-looking matrix (not a real code) with the three finder squares. */
export function qrMatrix(seed: number, n = 25): boolean[][] {
  const r = rng(seed);
  const finder = (x: number, y: number) => {
    for (const [ox, oy] of [
      [0, 0],
      [n - 7, 0],
      [0, n - 7],
    ]) {
      if (x >= ox && x < ox + 7 && y >= oy && y < oy + 7) {
        const dx = x - ox;
        const dy = y - oy;
        const ring = dx === 0 || dx === 6 || dy === 0 || dy === 6;
        const core = dx >= 2 && dx <= 4 && dy >= 2 && dy <= 4;
        return ring || core ? 1 : 0;
      }
      if (x >= ox - 1 && x <= ox + 7 && y >= oy - 1 && y <= oy + 7) return 0;
    }
    return -1;
  };
  return Array.from({ length: n }, (_, y) =>
    Array.from({ length: n }, (_, x) => {
      const f = finder(x, y);
      return f === -1 ? r() > 0.5 : f === 1;
    }),
  );
}

/** Lit windows for the night skyline: [x, y, w, h] in the skyline's own 1000×200 box. */
export function skylineWindows(seed: number, towers: [number, number, number][]) {
  const r = rng(seed);
  const out: [number, number, number, number, number][] = [];
  for (const [x, top, w] of towers) {
    for (let y = top + 8; y < 196; y += 9) {
      for (let wx = x + 4; wx < x + w - 5; wx += 7) {
        if (r() > 0.78) out.push([wx, y, 3, 4, 0.25 + r() * 0.6]);
      }
    }
  }
  return out;
}
