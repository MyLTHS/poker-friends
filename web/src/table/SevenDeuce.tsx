"use client";

// The 7-2 moment (design screens-table.tsx SevenDeuce): the winner's 7-2 turns over for everyone,
// medal and banner, a burst of confetti, then it settles into the banner while the next hand is
// coming. Static when it came from a snapshot replay or with reduced motion (no confetti).
import { useEffect, useState } from "react";

import type { SeatOccupant, SevenDeuceAward } from "@/api/protocol";
import { Avatar, Confetti, DURATION, FlipCard, PlayingCard, fmt, prefersReducedMotion } from "@/ui";

import { spotPos, type Device } from "./geometry";

export function SevenMedal({ size = 64 }: { size?: number }) {
  return (
    <span className="sd-medal" style={{ width: size, height: size, fontSize: Math.round(size * 0.36) }} aria-hidden>
      <b>7·2</b>
    </span>
  );
}

const nameOf = (seats: SeatOccupant[], playerId: string, seat: number) => seats.find((s) => s.player_id === playerId)?.display_name ?? `Ghế ${seat}`;

export function SevenLedger({ device, award, seats }: { device: Device; award: SevenDeuceAward; seats: SeatOccupant[] }) {
  const d = device === "desktop";
  const winner = nameOf(seats, award.player_id, award.seat);
  const short = award.payments.some((p) => p.amount < award.bonus);
  return (
    <div className={`sd-ledger sd-ledger-${device}`}>
      <div className="sd-ledger-head">
        <span>
          <small>Thưởng 7-2</small>
          <b>{fmt(award.bonus)} mỗi người đang ngồi</b>
        </span>
        <SevenMedal size={d ? 40 : 34} />
      </div>
      <ul className="sd-pay">
        {award.payments.map((p) => {
          const seat = seats.find((s) => s.player_id === p.player_id);
          const note = p.amount < award.bonus ? "hết chip" : seat?.sitting_out ? "đang nghỉ" : undefined;
          return (
            <li key={p.player_id}>
              <Avatar name={nameOf(seats, p.player_id, p.seat)} size={d ? 26 : 22} />
              <span className="sd-pay-name">
                {nameOf(seats, p.player_id, p.seat)}
                {note && <em>{note}</em>}
              </span>
              <b>−{fmt(p.amount)}</b>
            </li>
          );
        })}
      </ul>
      <div className="sd-total">
        <span>
          Tổng {winner} nhận
          <small>{short ? "người hết chip trả phần còn lại" : `${award.payments.length} người trả đủ, không ai âm chip`}</small>
        </span>
        <b>+{fmt(award.total)}</b>
      </div>
    </div>
  );
}

/** Phases of the moment: cards turning, then the banner and confetti, then settled. */
function useMoment(quiet: boolean) {
  const still = quiet || prefersReducedMotion();
  const [phase, setPhase] = useState<"turn" | "burst" | "settled">(still ? "settled" : "turn");
  useEffect(() => {
    if (still) return;
    const burst = setTimeout(() => setPhase("burst"), DURATION.flip);
    const settle = setTimeout(() => setPhase("settled"), DURATION.sevenDeuce);
    return () => {
      clearTimeout(burst);
      clearTimeout(settle);
    };
  }, [still]);
  return { phase, still };
}

/** On the stage: the revealed cards beside the winner, the banner, confetti while it bursts. */
export function SevenDeuceStage({ device, award, seats, spot, pot, quiet }: { device: Device; award: SevenDeuceAward; seats: SeatOccupant[]; spot: number; pot: number; quiet: boolean }) {
  const { phase, still } = useMoment(quiet);
  const winner = nameOf(seats, award.player_id, award.seat);
  const bp = spotPos(device, spot);
  const up = phase !== "turn";
  const moment = still ? "" : " is-moment";
  if (device === "mobile") {
    return (
      <>
        {phase === "burst" && <Confetti count={30} spread={0.8} small className="cf-m" />}
        <div className={`sd-banner sd-banner-m${moment}`} role="status">
          <span className="sd-cards">
            {award.cards.map((c, i) => (still ? <PlayingCard key={i} card={c} w={44} rotate={i === 0 ? -7 : 7} /> : <FlipCard key={i} card={c} faceUp={up} w={44} className={`sf-${i}`} />))}
          </span>
          <span className="sd-banner-text">
            <span className="sd-eyebrow">Bluff 7-2 thành công</span>
            <b className="sd-amount">+{fmt(award.total)}</b>
            <span className="sd-reveal">Bài {winner} tự lật cho cả bàn</span>
            <small className="sd-sub">{pot > 0 ? `Ăn pot ${fmt(pot)} khi cả bàn bỏ bài` : "Cả bàn bỏ bài"}</small>
          </span>
        </div>
      </>
    );
  }
  return (
    <>
      {phase === "burst" && <Confetti count={40} spread={1.25} className="cf-d" />}
      {/* My own 7-2 is already face up in front of me: the big reveal is for the others' seats,
          beside the seat toward the middle of the table. */}
      {spot !== 1 && (
        <div className={`sd-reveal-cards${moment}`} style={{ left: bp.x <= 550 ? bp.x + 168 : bp.x - 168, top: Math.min(bp.y - 6, 520) }}>
          <span className="sd-ribbon">Tự lật</span>
          <span className="sd-cards">
            {award.cards.map((c, i) => (still ? <PlayingCard key={i} card={c} w={68} rotate={i === 0 ? -7 : 7} /> : <FlipCard key={i} card={c} faceUp={up} w={68} className={`sf-${i}`} />))}
          </span>
          <span className="sd-reveal">Bài của {winner} · cả bàn và người xem đều thấy</span>
        </div>
      )}
      <div className={`sd-banner sd-banner-d${moment}`} role="status">
        <SevenMedal size={76} />
        <span className="sd-eyebrow">Bluff 7-2 thành công</span>
        <b className="sd-title">{winner} ăn pot bằng 7-2!</b>
        <span className="sd-line">
          Pot <b>{fmt(pot)}</b> <i /> Thưởng <b className="is-gain">+{fmt(award.total)}</b>
        </span>
        <small className="sd-sub">Mỗi người đang ngồi trả {fmt(award.bonus)} — kể cả người đang nghỉ</small>
      </div>
    </>
  );
}
