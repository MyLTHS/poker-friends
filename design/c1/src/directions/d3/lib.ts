// Pure helpers for "Kẹo Đêm" (d3): number formatting, avatar colours, deterministic decoration.

/** 1460 -> "1.460" (Vietnamese thousands separator). Always unsigned. */
export const fmt = (n: number) => String(Math.abs(Math.round(n))).replace(/\B(?=(\d{3})+(?!\d))/g, ".");

/** +1.130 / −540 / 0 (true minus sign). */
export const signed = (n: number) => (n > 0 ? "+" : n < 0 ? "−" : "") + fmt(n);

const AVATAR: Record<string, string> = {
  Lym: "#4FD1FF",
  An: "#FF4FA3",
  Bình: "#FFC93C",
  Chi: "#B8F35A",
  Dũng: "#FF9A4D",
  Giang: "#B69CFF",
  Hà: "#FF8C8C",
  Khoa: "#5EE6C4",
  Mai: "#FFB3DD",
  Tùng: "#8FE0FF",
  Ngọc: "#E4F57F",
};
export const colorOf = (name: string) => AVATAR[name] ?? "#C9C4F0";
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

export type Bit = { x: number; y: number; r: number; c: string; k: "rect" | "dot" | "tri" | "strip"; s: number };
const CANDY = ["#FF4FA3", "#B8F35A", "#4FD1FF", "#FFC93C", "#FFFFFF", "#B69CFF"];

/** Frozen confetti: positions in % of the container. */
export function confetti(seed: number, n: number): Bit[] {
  const r = rng(seed);
  const kinds: Bit["k"][] = ["rect", "dot", "tri", "strip", "rect", "strip"];
  return Array.from({ length: n }, () => ({
    x: r() * 100,
    y: r() * 100,
    r: Math.round(r() * 360),
    c: CANDY[Math.floor(r() * CANDY.length)],
    k: kinds[Math.floor(r() * kinds.length)],
    s: 0.7 + r() * 0.8,
  }));
}

/** A QR-looking matrix (not a real code) with the three finder squares. */
export function qrMatrix(seed: number, n = 25): boolean[][] {
  const r = rng(seed);
  const finder = (x: number, y: number) => {
    const inBox = (ox: number, oy: number) => x >= ox && x < ox + 7 && y >= oy && y < oy + 7;
    for (const [ox, oy] of [
      [0, 0],
      [n - 7, 0],
      [0, n - 7],
    ]) {
      if (inBox(ox, oy)) {
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
      return f === -1 ? r() > 0.52 : f === 1;
    }),
  );
}
