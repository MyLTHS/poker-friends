// Pure helpers for "Sơn Mài Vàng Son" (d4): number formatting, avatar pigments, and the
// generated textures (eggshell crackle, hand-laid gold leaf, lacquer grain, card back) that the
// stylesheet reads as CSS variables set on the direction's root.

/** 1460 -> "1.460" (Vietnamese thousands separator). Always unsigned. */
export const fmt = (n: number) => String(Math.abs(Math.round(n))).replace(/\B(?=(\d{3})+(?!\d))/g, ".");

/** +1.130 / −540 / 0 (true minus sign). */
export const signed = (n: number) => (n > 0 ? "+" : n < 0 ? "−" : "") + fmt(n);

/** Lacquer pigments for avatars: [body, highlight, letter colour]. */
const PIGMENT: Record<string, [string, string, string]> = {
  Lym: ["#7c1d12", "#c2462c", "#f7dc9a"], // cinnabar
  An: ["#1f4a3f", "#3f8a72", "#f2e6cc"], // jade lacquer
  Bình: ["#6b4a1c", "#b88a3f", "#fbecc4"], // ochre gold
  Chi: ["#2b2e5c", "#545ca3", "#efe1c0"], // indigo
  Dũng: ["#4a1d33", "#8a3c62", "#f3dcc4"], // plum
  Giang: ["#173a40", "#2f727a", "#efe3c8"], // teal black
  Hà: ["#5a2a17", "#9c5531", "#f6dfbd"], // umber
  Khoa: ["#2d3b23", "#5c7a43", "#f0e5c6"], // olive
  Mai: ["#6a2c2a", "#b0584d", "#f8e2c8"],
  Tùng: ["#22324a", "#4b6a8f", "#efe3c8"],
  Ngọc: ["#3c3a1c", "#7d7836", "#f5ebc8"],
  "khach-a1b2c3": ["#3a3430", "#6f665d", "#e9dcc4"],
};
export const pigment = (name: string): [string, string, string] => PIGMENT[name] ?? ["#3a2a22", "#6f5442", "#efe1c6"];
export const initial = (name: string) => name.charAt(0).toUpperCase();

/** Small deterministic PRNG (mulberry32) so generated texture is identical on every render. */
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

const uri = (svg: string) => `url("data:image/svg+xml,${encodeURIComponent(svg.replace(/\s+/g, " "))}")`;
const r1 = (n: number) => Math.round(n * 10) / 10;

type Pt = [number, number];

/** Inset a polygon towards its centroid by `d` px: the dark gaps between eggshell shards. */
function inset(poly: Pt[], d: number): Pt[] {
  const cx = poly.reduce((a, p) => a + p[0], 0) / poly.length;
  const cy = poly.reduce((a, p) => a + p[1], 0) / poly.length;
  return poly.map(([x, y]) => {
    const dx = cx - x;
    const dy = cy - y;
    const l = Math.hypot(dx, dy) || 1;
    return [x + (dx / l) * d, y + (dy / l) * d];
  });
}

/**
 * Eggshell inlay (khảm vỏ trứng): ivory shards on a periodic jittered grid, so the tile repeats
 * without a seam. Some cells split along a diagonal to look broken by hand.
 */
export function crackleSvg(seed: number, size = 132, n = 7, gap = 1.25, tones = ["#efe3cb", "#e7d8ba", "#f4ead7", "#dccbab", "#ece0c5", "#e2d3b4"]) {
  const r = rng(seed);
  const step = size / n;
  const jit = Array.from({ length: n }, () => Array.from({ length: n }, () => [(r() - 0.5) * step * 0.62, (r() - 0.5) * step * 0.62]));
  const P = (i: number, j: number): Pt => {
    const ii = ((i % n) + n) % n;
    const jj = ((j % n) + n) % n;
    return [i * step + jit[ii][jj][0], j * step + jit[ii][jj][1]];
  };
  const polys: string[] = [];
  const split = Array.from({ length: n }, () => Array.from({ length: n }, () => r()));
  const tone = Array.from({ length: n * n * 2 }, () => tones[Math.floor(r() * tones.length)]);
  for (let i = -1; i <= n; i++)
    for (let j = -1; j <= n; j++) {
      const a = P(i, j);
      const b = P(i + 1, j);
      const c = P(i + 1, j + 1);
      const d = P(i, j + 1);
      const s = split[((i % n) + n) % n][((j % n) + n) % n];
      const k = (((i % n) + n) % n) * n + (((j % n) + n) % n);
      const parts: Pt[][] = s < 0.34 ? [[a, b, c], [a, c, d]] : s < 0.6 ? [[a, b, d], [b, c, d]] : [[a, b, c, d]];
      parts.forEach((poly, pi) => {
        const pts = inset(poly, gap)
          .map(([x, y]) => `${r1(x)},${r1(y)}`)
          .join(" ");
        polys.push(`<polygon points='${pts}' fill='${tone[(k * 2 + pi) % tone.length]}'/>`);
      });
    }
  return `<svg xmlns='http://www.w3.org/2000/svg' width='${size}' height='${size}' viewBox='0 0 ${size} ${size}'>${polys.join("")}</svg>`;
}

/** Hand-laid gold leaf: overlapping squares, each a little off-axis and a shade apart, with seams. */
function leafSvg(seed: number, size = 96, n = 4, alpha = 0.16, seam = 0.22) {
  const r = rng(seed);
  const s = size / n;
  const out: string[] = [];
  for (let row = -1; row <= n; row++)
    for (let col = -1; col <= n; col++) {
      const x = col * s + (row % 2 ? s / 2 : 0) + (r() - 0.5) * 3;
      const y = row * s + (r() - 0.5) * 3;
      const rot = (r() - 0.5) * 3.2;
      const light = r() > 0.5;
      const a = alpha * 0.3 + r() * alpha;
      out.push(
        `<rect x='${r1(x)}' y='${r1(y)}' width='${r1(s + 1.5)}' height='${r1(s + 1.5)}' transform='rotate(${r1(rot)} ${r1(x + s / 2)} ${r1(y + s / 2)})' fill='${light ? "#fff3cf" : "#5a3a10"}' fill-opacity='${a.toFixed(2)}' stroke='#6b4612' stroke-opacity='${seam}' stroke-width='.7'/>`,
      );
    }
  return `<svg xmlns='http://www.w3.org/2000/svg' width='${size}' height='${size}' viewBox='0 0 ${size} ${size}'>${out.join("")}</svg>`;
}

/** Fine lacquer grain: fractal noise, warm, nearly transparent. */
const grainSvg = (alpha: number) =>
  `<svg xmlns='http://www.w3.org/2000/svg' width='180' height='180'><filter id='g'><feTurbulence type='fractalNoise' baseFrequency='.85' numOctaves='3' stitchTiles='stitch'/><feColorMatrix values='0 0 0 0 1  0 0 0 0 .86  0 0 0 0 .7  0 0 0 ${alpha} 0'/></filter><rect width='100%' height='100%' filter='url(#g)'/></svg>`;

/** Points of a Đông Sơn style sun: `rays` thin spikes between radii r0 and r1, centred on (c, c). */
export function sunRays(c: number, r0: number, r1: number, rays: number, half = 0.11) {
  const pts: string[] = [];
  for (let i = 0; i < rays; i++) {
    const a = (i / rays) * Math.PI * 2 - Math.PI / 2;
    const p = (ang: number, rad: number) => `${r1n(c + Math.cos(ang) * rad)},${r1n(c + Math.sin(ang) * rad)}`;
    pts.push(`M${p(a - half, r0)}L${p(a, r1)}L${p(a + half, r0)}Z`);
  }
  return pts.join("");
}
const r1n = (n: number) => Math.round(n * 100) / 100;

/** Ticks around a ring (the ladder band of a bronze drum face). */
export function ringTicks(c: number, r0: number, r1: number, count: number) {
  const out: string[] = [];
  for (let i = 0; i < count; i++) {
    const a = (i / count) * Math.PI * 2;
    out.push(`M${r1n(c + Math.cos(a) * r0)},${r1n(c + Math.sin(a) * r0)}L${r1n(c + Math.cos(a) * r1)},${r1n(c + Math.sin(a) * r1)}`);
  }
  return out.join("");
}

/** The card back: cinnabar lacquer, gold fillet, eggshell lattice corners and the sun medallion. */
function cardBackSvg() {
  const w = 120;
  const h = 168;
  const c = 60;
  return `<svg xmlns='http://www.w3.org/2000/svg' width='${w}' height='${h}' viewBox='0 0 ${w} ${h}'>
  <defs>
    <radialGradient id='l' cx='38%' cy='26%' r='90%'><stop offset='0' stop-color='#c2412b'/><stop offset='.45' stop-color='#8c2015'/><stop offset='1' stop-color='#4a0d07'/></radialGradient>
    <linearGradient id='g' x1='0' y1='0' x2='1' y2='1'><stop offset='0' stop-color='#8a6326'/><stop offset='.3' stop-color='#f5d993'/><stop offset='.5' stop-color='#c79847'/><stop offset='.72' stop-color='#fbe8b0'/><stop offset='1' stop-color='#9d7330'/></linearGradient>
    <pattern id='p' width='10' height='10' patternUnits='userSpaceOnUse' patternTransform='rotate(45)'><path d='M0 0H10M0 0V10' stroke='#f3cf86' stroke-opacity='.16' stroke-width='.8'/></pattern>
  </defs>
  <rect width='${w}' height='${h}' fill='url(#l)'/>
  <rect x='9' y='9' width='${w - 18}' height='${h - 18}' rx='5' fill='url(#p)' stroke='url(#g)' stroke-width='1.6'/>
  <rect x='13' y='13' width='${w - 26}' height='${h - 26}' rx='3' fill='none' stroke='url(#g)' stroke-opacity='.55' stroke-width='.6'/>
  <g transform='translate(0 ${h / 2 - c})'>
    <circle cx='${c}' cy='${c}' r='31' fill='#3d0a05' fill-opacity='.55' stroke='url(#g)' stroke-width='1.2'/>
    <path d='${ringTicks(c, 24, 29, 48)}' stroke='url(#g)' stroke-width='.7'/>
    <circle cx='${c}' cy='${c}' r='23' fill='none' stroke='url(#g)' stroke-width='.6'/>
    <path d='${sunRays(c, 6, 21, 14, 0.16)}' fill='url(#g)'/>
    <circle cx='${c}' cy='${c}' r='6.5' fill='url(#g)'/>
  </g>
  <path d='M18 18h14M18 18v14M${w - 18} 18h-14M${w - 18} 18v14M18 ${h - 18}h14M18 ${h - 18}v-14M${w - 18} ${h - 18}h-14M${w - 18} ${h - 18}v-14' stroke='url(#g)' stroke-width='1.4' fill='none'/>
</svg>`;
}

/** Sun medallion watermark for large lacquer surfaces (single colour, set by the caller's opacity). */
function sunMarkSvg(color: string, alpha: number) {
  const c = 100;
  return `<svg xmlns='http://www.w3.org/2000/svg' width='200' height='200' viewBox='0 0 200 200' fill='none' stroke='${color}' opacity='${alpha}'>
  <circle cx='${c}' cy='${c}' r='96' stroke-width='1'/><circle cx='${c}' cy='${c}' r='90' stroke-width='.6'/>
  <path d='${ringTicks(c, 78, 89, 72)}' stroke-width='.8'/>
  <circle cx='${c}' cy='${c}' r='77' stroke-width='.6'/><circle cx='${c}' cy='${c}' r='60' stroke-width='.8'/>
  <path d='${ringTicks(c, 62, 75, 36)}' stroke-width='.5'/>
  <path d='${sunRays(c, 14, 56, 14, 0.13)}' fill='${color}' stroke='none'/>
  <circle cx='${c}' cy='${c}' r='13' fill='${color}' stroke='none'/>
</svg>`;
}

/** CSS variables every d4 root carries (set inline so the stylesheet stays readable). */
export const TEXTURES: Record<string, string> = {
  "--tx-egg": uri(crackleSvg(7)),
  "--tx-egg-fine": uri(crackleSvg(19, 72, 6, 0.9)),
  "--tx-leaf": uri(leafSvg(5)),
  "--tx-leaf-soft": uri(leafSvg(9, 120, 6, 0.06, 0.08)),
  "--tx-leaf-mid": uri(leafSvg(13, 96, 4, 0.1, 0.15)),
  "--tx-grain": uri(grainSvg(0.07)),
  "--tx-grain-strong": uri(grainSvg(0.14)),
  "--tx-back": uri(cardBackSvg()),
  "--tx-sun": uri(sunMarkSvg("#e2b866", 0.09)),
  "--tx-sun-felt": uri(sunMarkSvg("#f3c77a", 0.16)),
};

/** Lym's lời/lỗ after each block of hands, per room (mock, ends at the PROFILE net values). */
export const TREND: Record<string, number[]> = {
  "Bàn thứ Sáu": [0, 120, 60, 260, 180, -80, -40, -220, -160, -400, -300, -540],
  "Tập luyện nhẹ": [0, -20, 10, -10, 30, 0, 40, 20, 30],
};

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
      return f === -1 ? r() > 0.52 : f === 1;
    }),
  );
}
