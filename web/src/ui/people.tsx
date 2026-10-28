// Avatars, the turn countdown ring and the club brand (ports of the design kit).
import { SuitIcon } from "./cards";

const AVATAR_TONES = ["#6B2A2A", "#2F4F3E", "#2D3B58", "#5E4526", "#4E2E52", "#3B4B50", "#5A3324", "#344A2B"];
const hash = (s: string) => [...s].reduce((a, ch) => (a * 31 + ch.charCodeAt(0)) >>> 0, 7);

/** Initial on a leather tone picked from the name, so a friend keeps one colour everywhere. */
export function Avatar({ name, size = 40, large = false, className = "" }: { name: string; size?: number; large?: boolean; className?: string }) {
  return (
    <span
      className={`av${large ? " av-lg" : ""} ${className}`}
      style={{ width: size, height: size, fontSize: Math.round(size * 0.5), backgroundColor: AVATAR_TONES[hash(name) % AVATAR_TONES.length] }}
      aria-hidden
    >
      {[...name][0]?.toUpperCase()}
    </span>
  );
}

/** Countdown ring drawn around an avatar of `size` (place both in a position: relative box).
 *  `left` / `total` in seconds; at 5s and under it turns red. The ring itself is static: C3
 *  re-renders it (or animates stroke-dasharray, docs/c2-chuyen-dong.md). */
export function TimerRing({ size, left, total, gap = 4, stroke = 4 }: { size: number; left: number; total: number; gap?: number; stroke?: number }) {
  const box = size + (gap + stroke) * 2;
  const r = size / 2 + gap + stroke / 2;
  const c = 2 * Math.PI * r;
  const frac = total > 0 ? Math.max(0, Math.min(1, left / total)) : 0;
  return (
    <svg className={`timer-ring${left <= 5 ? " is-low" : ""}`} width={box} height={box} viewBox={`0 0 ${box} ${box}`} aria-hidden>
      <circle className="tr-bg" cx={box / 2} cy={box / 2} r={r} strokeWidth={stroke} />
      <circle
        className="tr-fg"
        cx={box / 2}
        cy={box / 2}
        r={r}
        strokeWidth={stroke}
        strokeDasharray={`${c * frac} ${c}`}
        transform={`rotate(-90 ${box / 2} ${box / 2})`}
      />
    </svg>
  );
}

export function Crest({ size = 40 }: { size?: number }) {
  return (
    <span className="crest" style={{ width: size, height: size }} aria-hidden>
      <SuitIcon suit="♠" />
    </span>
  );
}

export function Wordmark({ small = false }: { small?: boolean }) {
  return (
    <span className={`wordmark${small ? " is-small" : ""}`}>
      <Crest size={small ? 32 : 40} />
      <span className="wm-text">
        <b>Poker Friends</b>
        <small>Câu lạc bộ bàn bè</small>
      </span>
    </span>
  );
}

/** Seat occupancy of a room as a tiny oval table (lobby cards, empty states). */
export function MiniTable({ seats, seated, w = 160, h = 96, dealer = false }: { seats: number; seated: number; w?: number; h?: number; dealer?: boolean }) {
  const dot = w >= 120 ? 12 : w >= 60 ? 8 : 5;
  const rx = w / 2 - dot / 2 - 1;
  const ry = h / 2 - dot / 2 - 1;
  return (
    <span className="mini-table" style={{ width: w, height: h }} role="img" aria-label={`${seated}/${seats} ghế có người`}>
      <span className="mini-rail" style={{ inset: dot / 2 + 2 }}>
        <span className="mini-felt" />
      </span>
      {Array.from({ length: seats }, (_, i) => {
        const a = Math.PI / 2 + (i * 2 * Math.PI) / seats;
        return (
          <i
            key={i}
            className={`mini-seat${i < seated ? " is-taken" : ""}`}
            style={{ width: dot, height: dot, left: w / 2 + Math.cos(a) * rx - dot / 2, top: h / 2 + Math.sin(a) * ry - dot / 2 }}
          />
        );
      })}
      {dealer && w >= 120 && <b className="mini-dealer">D</b>}
    </span>
  );
}
