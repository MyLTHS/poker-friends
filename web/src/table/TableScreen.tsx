"use client";

import Link from "next/link";
import { ArrowLeft, Eye, Wifi, WifiOff } from "lucide-react";
import { useEffect, useState } from "react";
import { ActionBar, type BarAction } from "@/club/ActionBar";
import { ChipAmount } from "@/club/chips";
import { Table } from "@/club/Table";
import { SevenDeuceMoment } from "./SevenDeuceMoment";
import { useTableSocket } from "./useTableSocket";
import { describeAction, raisePresets, tableView } from "./view";

function useNow(intervalMs: number) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);
  return now;
}

const newCommandId = () => crypto.randomUUID();

export function TableScreen({ url }: { url: string }) {
  const { model, dispatch } = useTableSocket(url);
  const now = useNow(250);
  const { table } = model;

  if (!table) {
    return (
      <div className="club-theme grid min-h-screen place-items-center p-6 text-center">
        <div>
          <p className="text-lg font-bold">Đang nối tới bàn chơi…</p>
          <p className="mt-2 text-sm text-[var(--muted)]">
            {model.status === "reconnecting" ? "Chưa nối được, đang thử lại. " : ""}
            Mock server chạy chưa? Mở một terminal và chạy <code>uv run python -m mockserver</code>.
          </p>
          <p className="mt-1 text-xs text-[var(--muted)]">{url}</p>
        </div>
      </div>
    );
  }

  const { hand, turn, room, you } = table;
  const view = tableView(table);
  const legal = hand?.legal_actions ?? null;
  const suspended = room.status === "suspended";
  const myTurn = !!legal && !!hand && !hand.complete && !suspended;
  const pending = !!model.pending;

  const remainingSec = turn ? Math.max(0, Math.ceil((Date.parse(turn.deadline) - (now + model.clockOffsetMs)) / 1000)) : undefined;
  const actor = hand?.actor ? table.seats.find((s) => s.player_id === hand.actor) : undefined;

  const online = model.status === "open";
  let status: string | undefined;
  if (!online) status = "Mất kết nối — đang nối lại…";
  else if (suspended) status = "Bàn tạm dừng — chưa đánh được.";
  else if (you.seat === null) status = "Bạn đang xem.";
  else if (!hand) status = "Chờ ván mới…";
  else if (hand.complete) status = "Ván đã xong, chờ ván mới…";
  else if (pending) status = "Đang gửi…";
  else if (!myTurn) status = actor ? `Chờ ${actor.display_name}…` : undefined;

  const presets = hand && legal ? raisePresets(hand, legal) : [];
  const minRaise = legal?.min_raise_to ?? 0;
  const maxRaise = legal?.max_raise_to ?? 0;
  const someoneBet = !!hand && hand.players.some((p) => p.bet > 0);
  const lastAction = model.lastAction ? describeAction(model.lastAction, table) : undefined;
  const myResult = model.results?.find((r) => r.player_id === you.player_id);

  const onAction = (kind: BarAction, amount?: number) => dispatch({ type: "act", kind, amount, commandId: newCommandId() });

  return (
    <div className="club-theme game-page">
      <div className="game-shell">
        <div className="game-head">
          <div>
            <Link className="icon-btn" href="/" aria-label="Chọn người chơi khác">
              <ArrowLeft />
            </Link>
            <div>
              <b>{room.name}</b>
              <span>
                <i className="live-dot" /> {hand ? `Ván #${hand.hand_no}` : "Giữa hai ván"} · <ChipAmount value={room.small_blind} /> / <ChipAmount value={room.big_blind} />
                {room.seven_deuce_bonus > 0 && <> · thưởng 7–2 <ChipAmount value={room.seven_deuce_bonus} /></>}
              </span>
            </div>
          </div>
          <div className="game-tools">
            {myResult && (
              <span className={`pill ${myResult.hand_net + myResult.seven_deuce_net >= 0 ? "pill-green" : "pill-red"}`}>
                Ván trước: {myResult.hand_net + myResult.seven_deuce_net >= 0 ? "+" : "−"}
                {Math.abs(myResult.hand_net + myResult.seven_deuce_net)} chip
              </span>
            )}
            {you.seat === null && (
              <span className="pill pill-neutral">
                <Eye size={13} /> Đang xem
              </span>
            )}
            <span className={`pill ${online ? "pill-green" : "pill-red"}`} role="status">
              {online ? <Wifi size={13} /> : <WifiOff size={13} />}
              {online ? "Đã kết nối" : "Mất kết nối — đang nối lại"}
            </span>
          </div>
        </div>
        <div className="game-grid">
          <main className="game-main">
            <Table
              players={view.players}
              board={view.board}
              pot={view.pot}
              lastAction={lastAction}
              heroIndex={view.heroIndex}
              dealerIndex={view.dealerIndex}
              smallBlindIndex={view.smallBlindIndex}
              bigBlindIndex={view.bigBlindIndex}
              countdown={remainingSec}
            >
              {model.celebration && (
                <SevenDeuceMoment
                  award={model.celebration}
                  seats={table.seats}
                  youId={you.player_id}
                  onClose={() => dispatch({ type: "dismiss.celebration" })}
                />
              )}
            </Table>
            {!model.celebration && (
              <ActionBar
                // New decision (hand, street or raise range) -> fresh slider at the minimum raise.
                key={`${hand?.hand_id}-${hand?.board.length}-${minRaise}-${maxRaise}`}
                minRaise={minRaise}
                maxRaise={Math.max(minRaise, maxRaise)}
                step={1}
                initialRaise={minRaise}
                presets={presets}
                onAction={onAction}
                enabled={online && myTurn && !pending}
                canFold={legal?.can_fold ?? false}
                canCheck={legal?.can_check ?? false}
                callAmount={legal?.call_amount ?? 0}
                canRaise={legal?.min_raise_to !== null && legal?.min_raise_to !== undefined}
                raiseLabel={someoneBet ? "TỐ" : "CƯỢC"}
                status={status}
                notice={model.notice?.text}
                onDismissNotice={() => dispatch({ type: "dismiss.notice" })}
              />
            )}
          </main>
        </div>
      </div>
    </div>
  );
}
