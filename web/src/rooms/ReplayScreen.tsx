"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

import { errorText, type Notice } from "@/account/messages";
import { Card, NoticeBox, Shell } from "@/account/ui";
import { PlayingCard } from "@/club/PlayingCard";
const toClubCard = (c: string) => c;

import { createRoomsApi, type HandReplay } from "./api";
import { describeStep } from "./replay";

/** /hands/<id> — step through a finished hand as the caller saw it (B8 test page). */
export function ReplayScreen({ handId }: { handId: number }) {
  const rooms = useMemo(() => createRoomsApi(), []);
  const [replay, setReplay] = useState<HandReplay | null>(null);
  const [notice, setNotice] = useState<Notice | null>(null);
  const [step, setStep] = useState(0);

  useEffect(() => {
    let cancelled = false;
    rooms.replay(handId).then((result) => {
      if (cancelled) return;
      if (result.ok) setReplay(result.data);
      else setNotice({ kind: "error", text: errorText(result.error) });
    });
    return () => {
      cancelled = true;
    };
  }, [rooms, handId]);

  if (!replay) {
    return (
      <Shell title="Xem lại ván" section="LỊCH SỬ">
        {notice ? <NoticeBox notice={notice} /> : <p className="text-sm text-[var(--muted)]">Đang tải…</p>}
      </Shell>
    );
  }

  const names = Object.fromEntries(replay.results.map((r) => [r.player_id, r.display_name]));
  const current = replay.steps[step];
  const hand = current.hand;
  const last = replay.steps.length - 1;
  const pot = hand.pots.reduce((sum, p) => sum + p.amount, 0) + hand.players.reduce((sum, p) => sum + p.bet, 0);

  return (
    <Shell title={`Ván ${replay.hand_no}`} section="XEM LẠI" wide>
      <Card>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm">
            Bước {step + 1}/{replay.steps.length}: <b>{describeStep(current.action, names)}</b>
          </p>
          <span className="flex gap-2">
            <button className="btn btn-secondary text-xs" disabled={step === 0} onClick={() => setStep(step - 1)}>
              ← Trước
            </button>
            <button className="btn btn-primary text-xs" disabled={step === last} onClick={() => setStep(step + 1)}>
              Sau →
            </button>
          </span>
        </div>
        <input
          type="range"
          min={0}
          max={last}
          value={step}
          onChange={(event) => setStep(Number(event.target.value))}
          aria-label="Chọn bước"
          className="mt-3 w-full accent-[var(--accent)]"
        />
      </Card>
      <Card>
        <p className="text-sm text-[var(--muted)]">
          Blind {hand.small_blind}/{hand.big_blind} · button ghế {hand.button_seat} · pot {pot}
        </p>
        <div className="mt-3 flex min-h-16 gap-2" aria-label="Bài chung">
          {hand.board.map((card) => (
            <PlayingCard key={card} value={toClubCard(card)} />
          ))}
          {hand.board.length === 0 && <span className="text-sm text-[var(--muted)]">Chưa lật bài chung</span>}
        </div>
        <ul className="mt-4 grid gap-2">
          {hand.players.map((player) => (
            <li
              key={player.player_id}
              className={`flex flex-wrap items-center justify-between gap-2 rounded-xl border px-4 py-2 ${
                hand.actor === player.player_id ? "border-[var(--accent)]" : "border-[var(--line)]"
              }`}
            >
              <span className="text-sm">
                <span className="text-[var(--muted)]">Ghế {player.seat} · </span>
                <b>{names[player.player_id] ?? player.player_id}</b> · còn {player.stack}
                {player.bet > 0 && ` · cược ${player.bet}`}
                {!player.in_hand && " · đã bỏ"}
              </span>
              <span className="flex gap-1">
                {player.cards.map((card, i) =>
                  card === "??" ? <PlayingCard key={i} value="" faceDown /> : <PlayingCard key={i} value={toClubCard(card)} />,
                )}
              </span>
            </li>
          ))}
        </ul>
      </Card>
      {step === last && (
        <Card>
          <h2 className="font-[family-name:var(--font-display)] text-xl">Kết quả</h2>
          <ul className="mt-2 text-sm">
            {replay.results.map((r) => (
              <li key={r.player_id}>
                {r.display_name}: {r.hand_net > 0 ? `+${r.hand_net}` : r.hand_net}
                {r.seven_deuce_net !== 0 && ` · thưởng 7-2 ${r.seven_deuce_net > 0 ? "+" : ""}${r.seven_deuce_net}`}
              </li>
            ))}
          </ul>
        </Card>
      )}
      <Link href={`/rooms/${replay.room_id}/history`} className="btn btn-ghost text-sm">
        Về lịch sử phòng
      </Link>
    </Shell>
  );
}
