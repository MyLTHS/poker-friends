"use client";

// The D1 poker table (port of design/c1 table.tsx): a top-down oval with the seats on the
// design's fixed coordinates (geometry.ts), drawn at design size and scaled as a whole to the room
// it gets (FitStage). Elements the animations move carry data-* hooks (data-seat-cards, data-bet,
// data-board, data-av, data-pot); TableFx finds them there.
import { createContext, useContext, useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { Crown, Moon, Plus, Timer, WifiOff } from "lucide-react";

import { Avatar, ChipStack, FlipCard, PlayingCard, fmt } from "@/ui";

import { LiveRing, secondsLeft, type TurnClock } from "./clock";
import { GEO, betPos, dealerPos, fitScale, spotPos, type Device, type Pt } from "./geometry";
import type { SeatView } from "./seatView";

const at = (p: Pt, extra?: CSSProperties): CSSProperties => ({ left: p.x, top: p.y, ...extra });

/** Scale of the stage on screen: animations convert screen boxes to stage pixels with it. */
export const StageScale = createContext(1);
export const useStageScale = () => useContext(StageScale);

/** Fills its box and scales a design-size stage into it, centred. */
export function FitStage({ device, className = "", children }: { device: Device; className?: string; children: ReactNode }) {
  const box = useRef<HTMLDivElement>(null);
  const [k, setK] = useState(1);
  const g = GEO[device];
  useLayoutEffect(() => {
    const el = box.current;
    if (!el) return;
    const measure = () => setK(fitScale(device, { width: el.clientWidth, height: el.clientHeight }));
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, [device]);
  return (
    <div ref={box} className={`stage-box ${className}`}>
      <div className="stage-fit" style={{ width: g.w * k, height: g.h * k }}>
        <div className="stage-scale" style={{ transform: `scale(${k})` }}>
          <StageScale.Provider value={k}>{children}</StageScale.Provider>
        </div>
      </div>
    </div>
  );
}

/* ---------- pieces on the felt ---------- */

export function Board({ device, cards, hi = [], hidden = 0 }: { device: Device; cards: string[]; hi?: number[]; hidden?: number }) {
  const g = GEO[device];
  return (
    <div className="board" style={at(g.board)} role="group" aria-label="Bài chung">
      {Array.from({ length: 5 }, (_, i) =>
        cards[i] && i < cards.length - hidden ? (
          <PlayingCard key={`${i}-${cards[i]}`} data-board={i} card={cards[i]} w={g.cardW} className={hi.length ? (hi.includes(i) ? "is-hi" : "is-lo") : ""} />
        ) : (
          <span key={i} className="board-slot" style={{ width: g.cardW, height: Math.round(g.cardW * 1.4) }} />
        ),
      )}
    </div>
  );
}

export function Pot({ device, amount, label = "Pot" }: { device: Device; amount: number; label?: string }) {
  const d = device === "desktop";
  return (
    <div className="pot" data-pot style={at(GEO[device].pot)}>
      <ChipStack amount={amount} cols={d ? 3 : 2} size={d ? 22 : 14} max={d ? 5 : 3} />
      <span className="pot-pill">
        <small>{label}</small>
        <b>{fmt(amount)}</b>
      </span>
    </div>
  );
}

function Bet({ device, s }: { device: Device; s: SeatView }) {
  return (
    <div className="bet" data-bet={s.seat} style={at(betPos(device, s.spot))}>
      <ChipStack amount={s.bet!} size={device === "desktop" ? 20 : 14} max={4} />
      <span className="bet-amt">{fmt(s.bet!)}</span>
    </div>
  );
}

/* ---------- seats ---------- */

function SeatTag({ s, device, left }: { s: SeatView; device: Device; left?: number }) {
  const ic = device === "desktop" ? 12 : 10;
  switch (s.state) {
    case "turn":
      return (
        <span className="tag tag-turn">
          <Timer size={ic} strokeWidth={2.4} />
          {left ?? ""}s
        </span>
      );
    case "folded":
      return <span className="tag tag-fold">Đã bỏ</span>;
    case "sitting-out":
      return (
        <span className="tag tag-out">
          <Moon size={ic} strokeWidth={2.2} />
          {s.lastAction ?? "Đang nghỉ"}
        </span>
      );
    case "disconnected":
      return (
        <span className="tag tag-dc">
          <WifiOff size={ic} strokeWidth={2.4} />
          {s.lastAction ?? "Mất kết nối"}
        </span>
      );
    case "all-in":
      return <span className="tag tag-allin">{s.lastAction ?? "All-in"}</span>;
    case "winner":
      return (
        <span className="tag tag-win">
          <Crown size={ic} strokeWidth={2.4} />
          Thắng
        </span>
      );
    default: {
      const text = s.lastAction ?? (s.blind === "SB" ? "Blind nhỏ" : s.blind === "BB" ? "Blind lớn" : undefined);
      return text ? <span className="tag">{text}</span> : null;
    }
  }
}

export type StageFx = {
  /** Seats whose face-up cards still show their backs (showdown flips not reached yet). */
  unflipped?: Set<number>;
};

function SeatPod({ device, s, cx, clock, now, fx, onSit }: { device: Device; s: SeatView; cx: number; clock?: TurnClock; now: number; fx: StageFx; onSit?: (seat: number) => void }) {
  const p = spotPos(device, s.spot);
  const d = device === "desktop";
  const avSize = d ? 56 : 36;
  if (s.state === "empty") {
    const inner = (
      <>
        <span className="chair" style={{ width: avSize, height: avSize }}>
          <Plus size={d ? 18 : 14} strokeWidth={2} />
        </span>
        <span className="chair-label">Ngồi vào</span>
      </>
    );
    return onSit ? (
      <button type="button" className="seat seat-empty" style={at(p)} onClick={() => onSit(s.seat)} aria-label={`Ngồi vào ghế ${s.seat}`}>
        {inner}
      </button>
    ) : (
      <div className="seat seat-empty is-idle" style={at(p)} aria-hidden>
        {inner}
      </div>
    );
  }
  const side = p.x <= cx ? "r" : "l";
  const cards = s.cards ?? [];
  const hidden = cards.length > 0 && !s.shown;
  const turning = fx.unflipped?.has(s.seat) ?? false;
  return (
    <div className={`seat st-${s.state} toward-${side}`} style={at(p)} data-seat={s.seat} role="group" aria-label={`Ghế ${s.seat}: ${s.name}`}>
      {s.delta && <span className={`delta delta-${s.delta.kind}`}>{s.delta.text}</span>}
      {s.bubble && <span className="bubble">{s.bubble}</span>}
      {s.shown && (
        <span className="seat-shown" data-seat-cards={s.seat}>
          {cards.map((c, i) => (
            <FlipCard key={i} card={c} faceUp={!turning} w={d ? 46 : 30} className={`sf-${i}`} />
          ))}
        </span>
      )}
      <span className="seat-av" data-av={s.seat} style={{ width: avSize, height: avSize }}>
        {hidden && (
          <span className={`seat-cards side-${side}`} data-seat-cards={s.seat}>
            {cards.map((c, i) => (
              <PlayingCard key={i} card={c} w={d ? 24 : 15} rotate={i === 0 ? -10 : 8} />
            ))}
          </span>
        )}
        <Avatar name={s.name ?? "?"} size={avSize} />
        {s.state === "turn" && clock && <LiveRing size={avSize} clock={clock} gap={2} stroke={d ? 4 : 3} />}
        {s.offline && (
          <span className="av-flag" aria-label="Mất kết nối">
            <WifiOff size={d ? 12 : 10} strokeWidth={2.6} />
          </span>
        )}
      </span>
      <span className="seat-plate">
        <b>{s.name}</b>
        <span className="stack">{fmt(s.stack ?? 0)}</span>
      </span>
      <SeatTag s={s} device={device} left={clock ? (clock.frozenAt ?? secondsLeft(clock.deadline, now)) : undefined} />
    </div>
  );
}

/** My own seat: big hole cards, wide plate. Desktop stacks cards over the plate; the phone puts
 *  the cards beside the plate (hint above it) at the bottom centre of the stage. */
function MeSeat({ device, s, hint, clock }: { device: Device; s: SeatView; hint?: ReactNode; clock?: TurnClock }) {
  const p = spotPos(device, 1);
  const cards = s.cards ?? [];
  const d = device === "desktop";
  return (
    <div className={`me me-${device} st-${s.state}`} style={at(p)} data-seat={s.seat} role="group" aria-label={`Ghế ${s.seat}: ${s.name} (bạn)`}>
      {s.delta && <span className={`delta delta-${s.delta.kind}`}>{s.delta.text}</span>}
      <span className="me-cards" data-seat-cards={s.seat}>
        {cards.length > 0 ? (
          cards.map((c, i) => <PlayingCard key={i} card={c} w={d ? 84 : 54} rotate={i === 0 ? -6 : 6} className="me-card" />)
        ) : (
          <span className="me-nocards">{s.state === "folded" ? "Đã bỏ bài" : "Chưa có bài"}</span>
        )}
      </span>
      <span className="me-plate">
        <span className="me-av" data-av={s.seat}>
          <Avatar name={s.name ?? "?"} size={d ? 44 : 38} />
          {s.state === "turn" && clock && <LiveRing size={d ? 44 : 38} clock={clock} gap={2} stroke={3.5} />}
        </span>
        <span className="me-id">
          <b>
            {s.name} <em>Bạn</em>
          </b>
          <span className="stack">{fmt(s.stack ?? 0)}</span>
        </span>
        {d && hint && <span className="me-hint">{hint}</span>}
      </span>
      {!d && hint && <span className="me-hint">{hint}</span>}
    </div>
  );
}

/* ---------- the stage ---------- */

export type StageProps = {
  device: Device;
  seats: SeatView[];
  board: string[];
  pot: number;
  potLabel?: string;
  mark: string;
  clock?: TurnClock;
  now: number;
  meHint?: ReactNode;
  showPot?: boolean;
  fx?: StageFx;
  /** Board cards not drawn yet (an animation deals them in). */
  boardHidden?: number;
  onSit?: (seat: number) => void;
  children?: ReactNode;
  className?: string;
};

export function Stage({ device, seats, board, pot, potLabel, mark, clock, now, meHint, showPot = true, fx = {}, boardHidden = 0, onSit, children, className = "" }: StageProps) {
  const g = GEO[device];
  const me = seats.find((s) => s.isMe);
  const button = seats.find((s) => s.isButton);
  return (
    <div className={`stage stage-${device} ${className}`} style={{ width: g.w, height: g.h }}>
      <div className="table-glow" style={{ left: g.oval.l - 60, top: g.oval.t - 50, width: g.oval.w + 120, height: g.oval.h + 100 }} />
      <div className="rail" style={{ left: g.oval.l, top: g.oval.t, width: g.oval.w, height: g.oval.h }}>
        <div className="felt">
          <div className="felt-line" />
        </div>
      </div>
      <div className="felt-mark" style={at(g.mark)}>
        {mark}
      </div>
      {showPot && pot > 0 && <Pot device={device} amount={pot} label={potLabel} />}
      <Board device={device} cards={board} hidden={boardHidden} />
      {seats.filter((s) => (s.bet ?? 0) > 0).map((s) => <Bet key={s.seat} device={device} s={s} />)}
      {button && (
        <span className="dealer" style={at(dealerPos(device, button.spot))} aria-label="Nút dealer">
          D
        </span>
      )}
      {seats
        .filter((s) => !s.isMe)
        .map((s) => (
          <SeatPod key={s.seat} device={device} s={s} cx={g.c.x} clock={s.state === "turn" ? clock : undefined} now={now} fx={fx} onSit={onSit} />
        ))}
      {me && <MeSeat device={device} s={me} hint={meHint} clock={me.state === "turn" ? clock : undefined} />}
      {children}
    </div>
  );
}
