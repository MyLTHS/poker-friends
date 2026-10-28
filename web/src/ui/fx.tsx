// The invite QR frame and the 7-2 confetti (ports of the design kit's QR / Confetti).
import type { CSSProperties } from "react";

/** The design's QR is a decorative look-alike. Here the code is drawn from `modules` (rows of
 *  dark/light cells, e.g. from a QR encoder of the invite link: C4 picks one) in the D1 frame:
 *  ivory paper, dark ink, the claret spade in a clear centre (use error correction H so the
 *  covered centre still scans). */
export function QR({ modules, size = 160, label }: { modules: boolean[][]; size?: number; label: string }) {
  const n = modules.length;
  let d = "";
  modules.forEach((row, r) => row.forEach((on, c) => on && (d += `M${c} ${r}h1v1h-1z`)));
  const hole = Math.max(3, Math.round(n / 5) | 1);
  const at = (n - hole) / 2;
  return (
    <svg className="qr" width={size} height={size} viewBox={`-2 -2 ${n + 4} ${n + 4}`} shapeRendering="crispEdges" role="img" aria-label={label}>
      <rect x="-2" y="-2" width={n + 4} height={n + 4} rx="1.5" className="qr-bg" />
      <path d={d} className="qr-fg" />
      <rect x={at} y={at} width={hole} height={hole} rx="1" className="qr-bg" />
      <path
        transform={`translate(${at + hole / 2 - 12.5 * (hole / 5)} ${at + hole / 2 - 12.9 * (hole / 5)}) scale(${hole / 5})`}
        d="M12.5 10.8c-.7 1-2 1.7-2 2.8 0 .6.5 1 1 1 .4 0 .7-.2.8-.4l-.4 1.1h1.2l-.4-1.1c.2.2.4.4.8.4.6 0 1-.4 1-1 0-1.1-1.3-1.8-2-2.8z"
        className="qr-mark"
      />
    </svg>
  );
}

/** A deterministic QR-looking 25×25 matrix (the design's pattern). Not scannable: for the /ui
 *  gallery and placeholders only. */
export function sampleQrModules(n = 25): boolean[][] {
  let seed = 20261027;
  const rnd = () => {
    seed = (seed * 1103515245 + 12345) % 2147483648;
    return seed / 2147483648;
  };
  const finder = (r: number, c: number) => {
    for (const [y, x] of [
      [0, 0],
      [0, n - 7],
      [n - 7, 0],
    ]) {
      const dy = r - y;
      const dx = c - x;
      if (dy >= -1 && dy <= 7 && dx >= -1 && dx <= 7) {
        if (dy < 0 || dy > 6 || dx < 0 || dx > 6) return false;
        const ring = Math.min(dy, dx, 6 - dy, 6 - dx);
        return ring !== 1;
      }
    }
    return null;
  };
  return Array.from({ length: n }, (_, r) =>
    Array.from({ length: n }, (_, c) => {
      const v = rnd();
      const f = finder(r, c);
      if (f !== null) return f;
      if (r === 6 || c === 6) return (r + c) % 2 === 0;
      return v > 0.53;
    }),
  );
}

const CONFETTI_COLORS = ["#E8CF92", "#D2AF66", "#C5484B", "#F3EAD7", "#86CFA0", "#9C7838"];

/** Confetti bursting from (0,0) of its positioned container (the 7-2 moment). The pieces fly out
 *  and fade (d1.css d1-confetti, --dur-confetti); with reduced motion they are not drawn at all. */
export function Confetti({ count = 34, spread = 1, small = false, className = "" }: { count?: number; spread?: number; small?: boolean; className?: string }) {
  return (
    <span className={`confetti${small ? " is-small" : ""} ${className}`} aria-hidden>
      {Array.from({ length: count }, (_, i) => {
        const a = (i * 137.508 * Math.PI) / 180;
        const dist = (34 + ((i * 53) % 118)) * spread;
        // rounded: server and browser Math.cos differ in the last digits (hydration mismatch)
        const style = {
          "--x": `${Math.round(Math.cos(a) * dist * 135) / 100}px`,
          "--y": `${Math.round(Math.sin(a) * dist * 95) / 100}px`,
          "--r": `${(i * 47) % 360}deg`,
          "--delay": `${(i % 6) * 18}ms`,
          backgroundColor: CONFETTI_COLORS[i % CONFETTI_COLORS.length],
        } as CSSProperties;
        return <i key={i} className={`cf cf-${i % 3}`} style={style} />;
      })}
    </span>
  );
}
