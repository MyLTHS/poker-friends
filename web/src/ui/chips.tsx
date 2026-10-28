// Chips of D1 (ports of the design kit's Chip / ChipStack). Denominations only pick colours: the
// game has no physical chip values, a stack just draws an amount.
import type { CSSProperties } from "react";

import { fmt } from "./format";

export const CHIP_DENOMS = [
  { v: 500, c: "#B8893C", e: "#2A1A10", d: "#6E4F1E" },
  { v: 100, c: "#232027", e: "#D9BA74", d: "#0E0C10" },
  { v: 25, c: "#1F6B4E", e: "#F1E6CF", d: "#0F3D2B" },
  { v: 5, c: "#8E1F27", e: "#F1E6CF", d: "#4E0F14" },
  { v: 1, c: "#E9DFC8", e: "#8E1F27", d: "#A79B80" },
] as const;

const vars = (v: Record<string, string>) => v as CSSProperties;

export function Chip({ denom = 25, size = 20, style, className = "" }: { denom?: number; size?: number; style?: CSSProperties; className?: string }) {
  const d = CHIP_DENOMS.find((x) => x.v === denom) ?? CHIP_DENOMS[2];
  return <span className={`chip ${className}`} style={{ ...vars({ "--s": `${size}px`, "--c": d.c, "--e": d.e, "--d": d.d }), ...style }} aria-hidden />;
}

/** Columns of chip denominations (bottom first) drawn for an amount: `cols` 1 mixes the largest
 *  denominations in one column, otherwise one column per denomination; at most `max` per column. */
export function chipColumns(amount: number, cols = 1, max = 5): number[][] {
  const groups: { denom: number; n: number }[] = [];
  let rest = Math.max(0, Math.floor(amount));
  for (const d of CHIP_DENOMS) {
    const n = Math.floor(rest / d.v);
    if (n > 0) {
      groups.push({ denom: d.v, n: Math.min(n, max) });
      rest -= n * d.v;
    }
  }
  if (groups.length === 0) groups.push({ denom: 1, n: 1 });
  if (cols === 1) return [groups.flatMap((g) => Array.from({ length: g.n }, () => g.denom)).slice(0, max)];
  return groups.slice(0, cols).map((g) => Array.from({ length: g.n }, () => g.denom));
}

/** Chips for an amount; screen readers hear the amount (aria-label). */
export function ChipStack({ amount, size = 20, cols = 1, max = 5, className = "" }: { amount: number; size?: number; cols?: number; max?: number; className?: string }) {
  return (
    <span className={`chipstack ${className}`} style={vars({ "--s": `${size}px` })} role="img" aria-label={`${fmt(amount)} chip`}>
      {chipColumns(amount, cols, max).map((col, ci) => (
        <span key={ci} className="chipcol" style={{ height: size + (col.length - 1) * 3 + 2 }}>
          {col.map((denom, i) => (
            <Chip key={i} denom={denom} size={size} style={{ bottom: i * 3 }} />
          ))}
        </span>
      ))}
    </span>
  );
}

