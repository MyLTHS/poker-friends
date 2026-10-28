// Kính & Ánh Kim (d2) — the component kit: frosted glass, champagne metal, porcelain cards,
// metal-and-ceramic chips. Every class is prefixed `k-` and lives under the `.d2` root.
import type { ReactNode } from "react";
import { Check } from "lucide-react";

import { isRed, type Card } from "../../shared/data";
import { FRAME, type Device } from "../../shared/screens";
import { fmt, initial, jewel, qrMatrix, skylineWindows, tone, vars } from "./lib";

/* ================================================================ frame */

/** Gradients shared by every SVG on the artboard (chips, logo, rings). */
function Defs() {
  return (
    <svg className="k-defs" width="0" height="0" aria-hidden>
      <defs>
        <linearGradient id="k-gold" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#FBF1D6" />
          <stop offset="0.3" stopColor="#E3C68C" />
          <stop offset="0.52" stopColor="#A9824B" />
          <stop offset="0.74" stopColor="#F0DCAA" />
          <stop offset="1" stopColor="#9E7944" />
        </linearGradient>
        <linearGradient id="k-steel" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#F4F8FA" />
          <stop offset="0.45" stopColor="#9CAEB7" />
          <stop offset="0.7" stopColor="#E3EBEE" />
          <stop offset="1" stopColor="#6E808A" />
        </linearGradient>
        <linearGradient id="k-cyan" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#9BF6FF" />
          <stop offset="1" stopColor="#1FB8D6" />
        </linearGradient>
        <radialGradient id="k-gloss" cx="0.32" cy="0.25" r="0.75">
          <stop offset="0" stopColor="#fff" stopOpacity="0.55" />
          <stop offset="0.45" stopColor="#fff" stopOpacity="0.06" />
          <stop offset="1" stopColor="#000" stopOpacity="0.18" />
        </radialGradient>
      </defs>
    </svg>
  );
}

/** One artboard: sized to the frame, lit background, glass grain, home indicator on the phone. */
export function Root({
  device,
  className = "",
  bg = "lounge",
  children,
}: {
  device: Device;
  className?: string;
  bg?: "lounge" | "table" | "auth";
  children: ReactNode;
}) {
  const f = FRAME[device];
  return (
    <div className={`d2 d2-${device} ${className}`} style={{ width: f.width, height: f.height }}>
      <div className={`k-bg k-bg-${bg}`} aria-hidden>
        {bg === "lounge" && <Skyline />}
      </div>
      <Defs />
      {children}
      {device === "mobile" && <span className="k-homebar" aria-hidden />}
    </div>
  );
}

/* ================================================================ brand */

export function Mark({ size = 36 }: { size?: number }) {
  return (
    <svg className="k-mark" width={size} height={size} viewBox="0 0 40 40" aria-hidden>
      <circle cx="20" cy="20" r="19" fill="#0B171C" stroke="url(#k-gold)" strokeWidth="1.6" />
      <circle cx="20" cy="20" r="15.5" fill="none" stroke="url(#k-gold)" strokeWidth="0.6" strokeDasharray="1.2 2.2" opacity="0.8" />
      <path
        d="M20 9.5c3.6 4.2 8.6 7.3 8.6 11.3 0 2.7-2 4.5-4.4 4.5-1.4 0-2.6-.6-3.3-1.6.3 2.4 1.3 4.3 3 5.6h-7.8c1.7-1.3 2.7-3.2 3-5.6-.7 1-1.9 1.6-3.3 1.6-2.4 0-4.4-1.8-4.4-4.5 0-4 5-7.1 8.6-11.3z"
        fill="url(#k-gold)"
      />
    </svg>
  );
}

export function Logo({ size = 36, sub }: { size?: number; sub?: string }) {
  return (
    <span className="k-logo">
      <Mark size={size} />
      <span className="k-logo-t">
        <b>Poker</b>
        <em>bạn bè</em>
        {sub && <small>{sub}</small>}
      </span>
    </span>
  );
}

/* ============================================================== surfaces */

export function Glass({
  className = "",
  strong,
  children,
}: {
  className?: string;
  strong?: boolean;
  children?: ReactNode;
}) {
  return <div className={`k-glass ${strong ? "k-glass-strong" : ""} ${className}`}>{children}</div>;
}

export function Eyebrow({ children, tone: t = "gold", className = "" }: { children: ReactNode; tone?: "gold" | "cyan" | "red" | "mute"; className?: string }) {
  return <span className={`k-eyebrow k-eyebrow-${t} ${className}`}>{children}</span>;
}

export function Divider({ children }: { children: ReactNode }) {
  return (
    <span className="k-divider">
      <i />
      {children}
      <i />
    </span>
  );
}

/* =============================================================== buttons */

export type BtnTone = "gold" | "cyan" | "glass" | "danger" | "light" | "ghost";

export function Btn({
  tone: t = "glass",
  size = "md",
  icon,
  iconRight,
  block,
  className = "",
  children,
}: {
  tone?: BtnTone;
  size?: "sm" | "md" | "lg" | "xl";
  icon?: ReactNode;
  iconRight?: ReactNode;
  block?: boolean;
  className?: string;
  children?: ReactNode;
}) {
  return (
    <span className={`k-btn k-btn-${t} k-btn-${size} ${block ? "k-btn-block" : ""} ${className}`}>
      {icon}
      {children && <span className="k-btn-l">{children}</span>}
      {iconRight}
    </span>
  );
}

export function IconBtn({
  icon,
  badge,
  active,
  className = "",
  label,
}: {
  icon: ReactNode;
  badge?: number | string;
  active?: boolean;
  className?: string;
  label?: string;
}) {
  return (
    <span className={`k-ibtn ${active ? "on" : ""} ${className}`} title={label}>
      {icon}
      {badge !== undefined && <b className="k-ibtn-badge k-num">{badge}</b>}
    </span>
  );
}

export function GoogleG({ size = 18 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" aria-hidden>
      <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z" />
      <path fill="#FF3D00" d="m6.3 14.7 6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z" />
      <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z" />
      <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z" />
    </svg>
  );
}

/* ================================================================ inputs */

export function Field({
  label,
  value,
  placeholder,
  secret,
  icon,
  right,
  state,
  hint,
  aside,
  className = "",
}: {
  label: string;
  value?: string;
  placeholder?: string;
  secret?: boolean;
  icon?: ReactNode;
  right?: ReactNode;
  state?: "focus" | "ok" | "error";
  hint?: ReactNode;
  aside?: ReactNode;
  className?: string;
}) {
  return (
    <label className={`k-field ${state ? `k-field-${state}` : ""} ${className}`}>
      <span className="k-field-top">
        <span className="k-field-l">{label}</span>
        {aside && <span className="k-field-aside">{aside}</span>}
      </span>
      <span className="k-input">
        {icon && <span className="k-input-ic">{icon}</span>}
        <span className={`k-input-v ${value ? "" : "ph"} ${secret ? "secret" : ""}`}>
          {value ?? placeholder}
          {state === "focus" && <i className="k-caret" />}
        </span>
        {right && <span className="k-input-r">{right}</span>}
      </span>
      {hint && <span className="k-field-hint">{hint}</span>}
    </label>
  );
}

/** Segmented control. */
export function Seg({ items, active, className = "", small }: { items: ReactNode[]; active: number; className?: string; small?: boolean }) {
  return (
    <span className={`k-seg ${small ? "k-seg-s" : ""} ${className}`}>
      {items.map((it, i) => (
        <span key={i} className={i === active ? "on" : ""}>
          {it}
        </span>
      ))}
    </span>
  );
}

export function Toggle({ on }: { on?: boolean }) {
  return (
    <span className={`k-toggle ${on ? "on" : ""}`}>
      <i />
    </span>
  );
}

export function Strength({ level, label }: { level: 1 | 2 | 3 | 4; label: string }) {
  return (
    <span className={`k-strength k-strength-${level}`}>
      <span className="k-strength-bars">
        {[1, 2, 3, 4].map((i) => (
          <i key={i} className={i <= level ? "on" : ""} />
        ))}
      </span>
      <b>{label}</b>
    </span>
  );
}

/* ================================================================ people */

export function Avatar({
  name,
  size = 40,
  dim,
  ring = "steel",
  className = "",
}: {
  name: string;
  size?: number;
  dim?: boolean;
  ring?: "steel" | "gold" | "cyan" | "none";
  className?: string;
}) {
  const [a, b] = jewel(name);
  return (
    <span
      className={`k-av k-av-${ring} ${dim ? "k-av-dim" : ""} ${className}`}
      style={vars({ "--s": `${size}px`, "--j1": a, "--j2": b })}
    >
      <span className="k-av-in">{initial(name)}</span>
    </span>
  );
}

/** Countdown ring drawn around whatever it wraps (an avatar, a number). */
export function Ring({
  size,
  left,
  total,
  stroke = 3,
  tone: t = "cyan",
  children,
  className = "",
}: {
  size: number;
  left: number;
  total: number;
  stroke?: number;
  tone?: "cyan" | "gold" | "red";
  children?: ReactNode;
  className?: string;
}) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  return (
    <span className={`k-ring k-ring-${t} ${className}`} style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden>
        <circle cx={size / 2} cy={size / 2} r={r} className="k-ring-track" strokeWidth={stroke} fill="none" />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          className="k-ring-bar"
          strokeWidth={stroke}
          fill="none"
          strokeLinecap="round"
          strokeDasharray={`${(c * left) / total} ${c}`}
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
        />
      </svg>
      <span className="k-ring-in">{children}</span>
    </span>
  );
}

export function Pill({
  tone: t = "mute",
  icon,
  children,
  className = "",
}: {
  tone?: "mute" | "gold" | "cyan" | "red" | "glass" | "solid";
  icon?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <span className={`k-pill k-pill-${t} ${className}`}>
      {icon}
      {children}
    </span>
  );
}

/* ============================================================ money / chips */

export type ChipTone = "onyx" | "ivory" | "petrol" | "ruby" | "gold";
const CHIP: Record<ChipTone, { body: string; side: string; edge: string; face: string }> = {
  onyx: { body: "#1D262C", side: "#0E1418", edge: "#E9D3A0", face: "#2A353C" },
  ivory: { body: "#EEE7D9", side: "#B9AF9C", edge: "#11545C", face: "#F7F2E8" },
  petrol: { body: "#11616A", side: "#073A40", edge: "#F2EBDD", face: "#167079" },
  ruby: { body: "#A12A3A", side: "#5E1220", edge: "#F2EBDD", face: "#B33447" },
  gold: { body: "#C9A465", side: "#7A5A2C", edge: "#1D262C", face: "#E2C68C" },
};

/** A single chip seen from above: ceramic body, eight edge inlays, metal centre. */
export function Chip({ tone: t = "onyx", size = 18, className = "" }: { tone?: ChipTone; size?: number; className?: string }) {
  const c = CHIP[t];
  return (
    <svg className={`k-chip ${className}`} width={size} height={size} viewBox="0 0 40 40" aria-hidden>
      <circle cx="20" cy="20" r="19.4" fill={c.body} stroke="rgba(0,0,0,.35)" strokeWidth="0.6" />
      <circle cx="20" cy="20" r="16.4" fill="none" stroke={c.edge} strokeWidth="5.2" strokeDasharray="6.44 6.44" />
      <circle cx="20" cy="20" r="11.6" fill={c.face} stroke={c.edge} strokeWidth="0.9" strokeDasharray="1.4 1.4" />
      <circle cx="20" cy="20" r="7.4" fill={t === "gold" ? "url(#k-steel)" : "url(#k-gold)"} stroke="rgba(0,0,0,.25)" strokeWidth="0.5" />
      <circle cx="20" cy="20" r="19.4" fill="url(#k-gloss)" />
    </svg>
  );
}

/** A stack of chips in three-quarter view (bottom to top). */
export function Stack({ tones, w = 26, className = "" }: { tones: ChipTone[]; w?: number; className?: string }) {
  const T = 4.6; // chip thickness in viewBox units (chip is 40 wide)
  const RY = 11;
  const H = RY * 2 + T * tones.length + 2;
  const sideX = [5, 12, 20, 28, 35];
  return (
    <svg className={`k-stack ${className}`} width={w} height={(w * H) / 40} viewBox={`0 0 40 ${H}`} aria-hidden>
      <ellipse cx="20" cy={H - RY + 1.5} rx="19" ry={RY} fill="rgba(0,0,0,.45)" />
      {tones.map((t, k) => {
        const c = CHIP[t];
        const cy = H - 1 - T - RY - k * T;
        return (
          <g key={k}>
            <path d={`M1 ${cy}A19 ${RY} 0 0 0 39 ${cy}L39 ${cy + T}A19 ${RY} 0 0 1 1 ${cy + T}Z`} fill={c.side} />
            {sideX.map((x) => {
              const yTop = cy + RY * Math.sqrt(Math.max(0, 1 - ((x - 20) / 19) ** 2));
              return <rect key={x} x={x - 1.4} y={yTop + 0.6} width="2.8" height={T - 1.2} rx="0.4" fill={c.edge} opacity="0.92" />;
            })}
            <ellipse cx="20" cy={cy} rx="19" ry={RY} fill={c.body} />
            {k === tones.length - 1 && (
              <>
                <ellipse cx="20" cy={cy} rx="16" ry={RY - 2.2} fill="none" stroke={c.edge} strokeWidth="3.2" strokeDasharray="5.4 5.4" />
                <ellipse cx="20" cy={cy} rx="10.6" ry="5.9" fill={c.face} stroke={c.edge} strokeWidth="0.7" />
                <ellipse cx="20" cy={cy} rx="6.6" ry="3.6" fill={t === "gold" ? "url(#k-steel)" : "url(#k-gold)"} />
                <ellipse cx="20" cy={cy} rx="19" ry={RY} fill="url(#k-gloss)" />
              </>
            )}
          </g>
        );
      })}
    </svg>
  );
}

/** Chips plus the amount on a small glass plate: a bet in front of a seat, or the pot. */
export function Bet({
  amount,
  tones = ["ivory", "petrol"],
  w = 22,
  className = "",
  label,
}: {
  amount: number;
  tones?: ChipTone[];
  w?: number;
  className?: string;
  label?: string;
}) {
  return (
    <span className={`k-bet ${className}`}>
      <Stack tones={tones} w={w} />
      <span className="k-bet-v">
        {label && <small>{label}</small>}
        <b className="k-num">{fmt(amount)}</b>
      </span>
    </span>
  );
}

/** The dealer button: a thick porcelain puck. */
export function Dealer({ size = 24, className = "" }: { size?: number; className?: string }) {
  return (
    <span className={`k-dealer ${className}`} style={vars({ "--s": `${size}px` })}>
      D
    </span>
  );
}

/* ================================================================= cards */

const SUIT_PATH: Record<string, string> = {
  "♠": "M12 1.8C9 6.4 3.4 9.5 3.4 14a4.6 4.6 0 0 0 7.7 3.4c-.2 2-1 3.6-2.7 4.9h7.2c-1.7-1.3-2.5-2.9-2.7-4.9A4.6 4.6 0 0 0 20.6 14c0-4.5-5.6-7.6-8.6-12.2z",
  "♥": "M12 21.4C6.9 17.1 2.4 13.5 2.4 8.6c0-3 2.3-5.4 5.2-5.4 1.8 0 3.4.9 4.4 2.5 1-1.6 2.6-2.5 4.4-2.5 2.9 0 5.2 2.4 5.2 5.4 0 4.9-4.5 8.5-9.6 12.8z",
  "♦": "M12 1.6c2.1 3.6 4.8 6.9 7.8 10.4-3 3.5-5.7 6.8-7.8 10.4-2.1-3.6-4.8-6.9-7.8-10.4 3-3.5 5.7-6.8 7.8-10.4z",
  "♣": "M12 2.2a4.4 4.4 0 0 0-4 6.3 4.4 4.4 0 1 0 2.6 7.6c-.3 2.5-1.2 4.4-2.9 5.7h8.6c-1.7-1.3-2.6-3.2-2.9-5.7a4.4 4.4 0 1 0 2.6-7.6 4.4 4.4 0 0 0-4-6.3z",
};

/** Suit glyph as a path, so every card draws the same shapes whatever the font. */
export function Suit({ suit, size = 14, className = "" }: { suit: string; size?: number; className?: string }) {
  return (
    <svg className={`k-suit ${className}`} width={size} height={size} viewBox="0 0 24 24" aria-hidden>
      <path d={SUIT_PATH[suit]} />
    </svg>
  );
}

/** Porcelain playing card: corner indices, big centre pip, framed monogram on court cards. */
export function PCard({
  c,
  w = 56,
  tilt = 0,
  className = "",
  glow,
  dim,
}: {
  c: Card;
  w?: number;
  tilt?: number;
  className?: string;
  glow?: "gold" | "cyan";
  dim?: boolean;
}) {
  const style = vars({ "--w": `${w}px`, transform: tilt ? `rotate(${tilt}deg)` : "none" });
  if (c === "back")
    return (
      <span className={`k-card k-card-back ${dim ? "k-card-dim" : ""} ${className}`} style={style}>
        <i className="k-card-back-in">{w >= 20 && <Mark size={Math.round(w * 0.42)} />}</i>
      </span>
    );
  const small = w < 34;
  const court = c.rank === "K" || c.rank === "Q" || c.rank === "J";
  const idx = (
    <>
      <b>{c.rank}</b>
      <Suit suit={c.suit} size={Math.round(w * (small ? 0.3 : 0.2))} />
    </>
  );
  return (
    <span
      className={`k-card ${isRed(c) ? "red" : "blk"} ${small ? "k-card-s" : ""} ${glow ? `k-card-glow-${glow}` : ""} ${dim ? "k-card-dim" : ""} ${className}`}
      style={style}
    >
      <span className="k-card-idx">{idx}</span>
      {court ? (
        <span className="k-card-court">
          <b>{c.rank}</b>
          <Suit suit={c.suit} size={Math.round(w * 0.2)} />
        </span>
      ) : (
        <span className="k-card-pip">
          <Suit suit={c.suit} size={Math.round(w * (c.rank === "A" ? 0.56 : 0.46))} />
        </span>
      )}
      <span className="k-card-idx k-card-idx-b">{idx}</span>
    </span>
  );
}

/** An empty board slot. */
export const Slot = ({ w = 56 }: { w?: number }) => <span className="k-slot" style={vars({ "--w": `${w}px` })} />;

/* ================================================================== misc */

export function Spark({
  points,
  w = 120,
  h = 32,
  className = "",
}: {
  points: number[];
  w?: number;
  h?: number;
  className?: string;
}) {
  const min = Math.min(...points, 0);
  const max = Math.max(...points, 0);
  const span = max - min || 1;
  const xy = points.map((p, i) => [(i / (points.length - 1)) * (w - 4) + 2, h - 3 - ((p - min) / span) * (h - 6)]);
  const d = xy.map(([x, y], i) => `${i ? "L" : "M"}${x.toFixed(1)} ${y.toFixed(1)}`).join("");
  const zero = h - 3 - ((0 - min) / span) * (h - 6);
  const last = points[points.length - 1];
  return (
    <svg className={`k-spark k-spark-${tone(last)} ${className}`} width={w} height={h} viewBox={`0 0 ${w} ${h}`} aria-hidden>
      <line x1="0" x2={w} y1={zero} y2={zero} className="k-spark-zero" />
      <path d={`${d}L${xy[xy.length - 1][0]} ${h}L2 ${h}Z`} className="k-spark-fill" />
      <path d={d} className="k-spark-line" fill="none" />
      <circle cx={xy[xy.length - 1][0]} cy={xy[xy.length - 1][1]} r="2.6" className="k-spark-dot" />
    </svg>
  );
}

export function QR({ size = 132, seed = 37 }: { size?: number; seed?: number }) {
  const m = qrMatrix(seed);
  const n = m.length;
  return (
    <span className="k-qr" style={{ width: size, height: size }}>
      <svg width={size - 16} height={size - 16} viewBox={`0 0 ${n} ${n}`} shapeRendering="crispEdges" aria-hidden>
        {m.map((row, y) => row.map((on, x) => (on ? <rect key={`${x}-${y}`} x={x} y={y} width="1" height="1" fill="#0B171C" /> : null)))}
      </svg>
      <span className="k-qr-mark">
        <Mark size={Math.round(size * 0.2)} />
      </span>
    </span>
  );
}

const TOWERS: [number, number, number][] = [
  [0, 120, 46], [50, 92, 38], [92, 136, 30], [126, 60, 44], [174, 110, 36], [214, 140, 52], [270, 84, 34],
  [308, 30, 40], [352, 118, 48], [404, 96, 30], [438, 128, 56], [498, 70, 42], [544, 112, 34], [582, 50, 38],
  [624, 132, 46], [674, 100, 32], [710, 76, 48], [762, 124, 40], [806, 88, 36], [846, 140, 44], [894, 104, 50],
  [948, 126, 52],
];
const WINDOWS = skylineWindows(11, TOWERS);

/** The night city behind the glass: towers, lit windows, one beacon. Purely decorative. */
export function Skyline({ className = "" }: { className?: string }) {
  return (
    <svg className={`k-skyline ${className}`} viewBox="0 0 1000 200" preserveAspectRatio="xMidYMax slice" aria-hidden>
      <defs>
        <linearGradient id="k-tower" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#16313A" />
          <stop offset="1" stopColor="#0A161B" />
        </linearGradient>
      </defs>
      {TOWERS.map(([x, top, w]) => (
        <rect key={x} x={x} y={top} width={w - 3} height={200 - top} fill="url(#k-tower)" />
      ))}
      <rect x="326" y="12" width="3" height="20" fill="#16313A" />
      <circle cx="327.5" cy="11" r="2.2" fill="#FF6A5C" />
      {WINDOWS.map(([x, y, w, h, o], i) => (
        <rect key={i} x={x} y={y} width={w} height={h} fill={i % 7 ? "#F3DDA6" : "#9BEFFF"} opacity={o} />
      ))}
    </svg>
  );
}

/** Small "ok" tick used inside fields. */
export const OkTick = () => (
  <span className="k-ok">
    <Check size={13} strokeWidth={3.2} />
  </span>
);
