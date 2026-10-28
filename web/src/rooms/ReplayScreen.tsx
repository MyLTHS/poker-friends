"use client";

// /hands/<id>: step through a finished hand as the caller saw it (design screens-social.tsx
// Replay). The same D1 stage as the live table; stepping forward one step plays that step's
// animation (cues.ts), any jump shows the step at once. Only the caller's own cards are face up,
// other hands stay down unless the hand went to showdown.
import "@/table/table.css";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Check, ChevronLeft, ChevronRight, Pause, Play, SkipBack, SkipForward } from "lucide-react";

import { errorText } from "@/account/messages";
import type { AppliedAction, HandView, TableState } from "@/api/protocol";
import { cuesFor, type Cue } from "@/table/cues";
import { useDevice } from "@/table/device";
import type { Device } from "@/table/geometry";
import { describeAction, tableView } from "@/table/seatView";
import { MobileTableBar, TableTopBar } from "@/table/Side";
import { FitStage, Stage } from "@/table/Stage";
import { useTableFx, type SeatPlace } from "@/table/TableFx";
import { ButtonLink, D1Root, ErrorState, Spinner, fmt, signed } from "@/ui";

import { createRoomsApi, type HandReplay } from "./api";
import { describeStep } from "./replay";

const STEP_MS = 1400;

/** REST types the players as a plain array; the socket's HandView as a tuple of two or more. */
type Step = { action: AppliedAction | null; hand: HandView };
const stepsOf = (replay: HandReplay) => replay.steps as Step[];

/** The caller: the one player whose hole cards the first step shows face up. */
function viewer(hand: HandView): string | null {
  return hand.players.find((p) => p.cards.length > 0 && p.cards.every((c) => c !== "??"))?.player_id ?? null;
}

/** A TableState around one replay step, so the live table's view and stage draw it. */
function tableAt(replay: HandReplay, hand: HandView, me: string | null, roomName: string, maxSeats = 9): TableState {
  const names = Object.fromEntries(replay.results.map((r) => [r.player_id, r.display_name]));
  const mySeat = hand.players.find((p) => p.player_id === me)?.seat ?? null;
  return {
    room: {
      room_id: replay.room_id,
      name: roomName,
      status: "open",
      max_seats: Math.max(maxSeats, ...hand.players.map((p) => p.seat)),
      small_blind: hand.small_blind,
      big_blind: hand.big_blind,
      think_time_seconds: 0,
      seven_deuce_bonus: 0,
    },
    you: { player_id: me ?? "", seat: mySeat },
    seats: hand.players.map((p) => ({
      seat: p.seat,
      player_id: p.player_id,
      display_name: names[p.player_id] ?? `Ghế ${p.seat}`,
      stack: p.stack,
      sitting_out: false,
      connected: true,
    })),
    hand,
    turn: null,
  };
}

/** Labels under the seats at a step, as the live table shows them: the street's last actions and
 *  every fold of the hand. */
function actionsAt(steps: Step[], step: number): Record<number, AppliedAction> {
  let out: Record<number, AppliedAction> = {};
  for (let i = 1; i <= step; i++) {
    const { action, hand } = steps[i];
    if (hand.board.length > steps[i - 1].hand.board.length) out = Object.fromEntries(Object.entries(out).filter(([, a]) => a.kind === "fold"));
    if (action && (action.kind === "fold" || hand.board.length === steps[i - 1].hand.board.length)) out = { ...out, [action.seat]: action };
  }
  return out;
}

/** Street labels under the step slider: where the flop, turn and river first show. */
function streetLabels(replay: HandReplay): string[] {
  const names: Record<number, string> = { 3: "Flop", 4: "Turn", 5: "River" };
  return replay.steps.map((s, i) => {
    if (i === 0) return "Chia";
    if (i === replay.steps.length - 1) return "Kết quả";
    const before = replay.steps[i - 1].hand.board.length;
    return s.hand.board.length > before ? (names[s.hand.board.length] ?? "") : "";
  });
}

export function ReplayScreen({ handId }: { handId: number }) {
  const rooms = useMemo(() => createRoomsApi(), []);
  const [replay, setReplay] = useState<HandReplay | null>(null);
  const [roomName, setRoomName] = useState("");
  const [maxSeats, setMaxSeats] = useState(9);
  const [error, setError] = useState<string | null>(null);
  const [step, setStep] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState<1 | 2>(1);
  const [fx, setFx] = useState<{ cues: Cue[]; epoch: number }>({ cues: [], epoch: 0 });
  const device = useDevice();

  useEffect(() => {
    let cancelled = false;
    rooms.replay(handId).then((result) => {
      if (cancelled) return;
      if (!result.ok) return setError(errorText(result.error));
      setReplay(result.data);
      rooms.get(result.data.room_id).then((room) => {
        if (cancelled || !room.ok) return;
        setRoomName(room.data.room.name);
        setMaxSeats(room.data.room.max_seats);
      });
    });
    return () => {
      cancelled = true;
    };
  }, [rooms, handId]);

  const me = useMemo(() => (replay ? viewer(stepsOf(replay)[0].hand) : null), [replay]);
  const last = replay ? replay.steps.length - 1 : 0;

  /** Go to a step: one step forward animates, anything else jumps. */
  const goTo = useCallback(
    (target: number) => {
      if (!replay) return;
      const next = Math.max(0, Math.min(last, target));
      if (next === step) return;
      if (next !== step + 1) {
        setFx((f) => ({ cues: f.cues, epoch: f.epoch + 1 }));
      } else {
        const { action, hand } = stepsOf(replay)[next];
        const prev = tableAt(replay, stepsOf(replay)[step].hand, me, roomName, maxSeats);
        const bodies = action
          ? cuesFor(prev, { protocol_version: 1, type: "action.applied", room_id: replay.room_id, hand_id: hand.hand_id, version: next, server_time: "", payload: { action, hand } })
          : [];
        setFx((f) => {
          let id = f.cues.at(-1)?.id ?? 0;
          return { cues: [...f.cues, ...bodies.map((b) => ({ ...b, id: ++id }) as Cue)].slice(-12), epoch: f.epoch };
        });
      }
      setStep(next);
    },
    [replay, last, step, me, roomName, maxSeats],
  );

  // Autoplay: one step every STEP_MS / speed, stopping at the result.
  useEffect(() => {
    if (!playing) return;
    if (step >= last) {
      const stop = setTimeout(() => setPlaying(false), 0);
      return () => clearTimeout(stop);
    }
    const timer = setTimeout(() => goTo(step + 1), STEP_MS / speed);
    return () => clearTimeout(timer);
  }, [playing, step, last, speed, goTo]);

  // Keyboard: ← → step, space plays.
  const keys = useRef({ goTo, step, playing });
  useEffect(() => {
    keys.current = { goTo, step, playing };
  });
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement | null)?.tagName === "INPUT" && (e.target as HTMLInputElement).type !== "range") return;
      const k = keys.current;
      if (e.key === "ArrowRight") k.goTo(k.step + 1);
      else if (e.key === "ArrowLeft") k.goTo(k.step - 1);
      else if (e.key === " ") setPlaying((p) => !p);
      else return;
      e.preventDefault();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const table = replay ? tableAt(replay, stepsOf(replay)[step].hand, me, roomName, maxSeats) : null;
  const view = useMemo(() => (table && replay ? tableView(table, { lastActions: actionsAt(stepsOf(replay), step) }) : null), [table, replay, step]);
  const placeOf = useCallback(
    (seat: number): SeatPlace | undefined => {
      const s = view?.seats.find((v) => v.seat === seat);
      return s && { spot: s.spot, me: !!s.isMe };
    },
    [view],
  );
  const { layer, fx: stageFx } = useTableFx({ cues: fx.cues, epoch: fx.epoch, device, placeOf });

  if (!replay || !table || !view) {
    return (
      <D1Root bg="table" className="tbl-wait">
        <div className="tbl-wait-box">
          {error ? (
            <ErrorState title="Không mở được ván này" text={error} actions={<ButtonLink kind="primary" href="/rooms">Về sảnh</ButtonLink>} />
          ) : (
            <>
              <Spinner size={56} />
              <b>Đang tải ván…</b>
            </>
          )}
        </div>
      </D1Root>
    );
  }

  const names = Object.fromEntries(replay.results.map((r) => [r.player_id, r.display_name]));
  const timeline = replay.steps.map((s, i) => (i === 0 ? describeStep(null, names) : describeAction(s.action!, names[s.action!.player_id] ?? `Ghế ${s.action!.seat}`)));
  const caption = step === last && replay.steps[last].hand.complete ? resultLine(replay, names) : timeline[step];
  const backHref = `/rooms/${replay.room_id}/history`;
  const time = new Date(replay.completed_at);
  const at = Number.isNaN(time.getTime()) ? "" : `${String(time.getHours()).padStart(2, "0")}:${String(time.getMinutes()).padStart(2, "0")}`;
  const myResult = replay.results.find((r) => r.player_id === me);
  const shown = replay.steps[last].hand.players.filter((p) => p.player_id !== me && p.cards.length && p.cards.every((c) => c !== "??")).length > 0;
  const labels = streetLabels(replay);

  const stage = (
    <Stage
      device={device}
      seats={view.seats}
      board={view.board}
      pot={view.pot}
      mark={`${roomName || "Ván"} · ${fmt(table.room.small_blind)}/${fmt(table.room.big_blind)}`}
      showPot={!table.hand?.complete}
      fx={stageFx}
      meHint={
        me ? (
          <span className="turn-hint is-quiet">
            {device === "desktop" ? (
              <small>Bài của bạn</small>
            ) : (
              <>
                <small>Bạn xem bài mình,</small>
                <small>bài người khác úp</small>
              </>
            )}
          </span>
        ) : undefined
      }
    >
      {layer}
      {/* The caption sits where the top seats are (top centre; on the phone also 5 and 6): with
          someone there the timeline's "đang xem" line says it instead. */}
      {!view.seats.some((s) => s.state !== "empty" && (device === "desktop" ? [10] : [5, 6, 10]).includes(s.spot)) && (
        <div className={`rp-caption rp-caption-${device}`} role="status" aria-live="polite">
          <small>
            Bước {step + 1}/{replay.steps.length}
          </small>
          <b>{caption}</b>
        </div>
      )}
    </Stage>
  );

  const slider = <StepSlider device={device} step={step} count={replay.steps.length} labels={labels} onChange={goTo} />;
  const transport = <Transport device={device} playing={playing} atStart={step === 0} atEnd={step === last} onFirst={() => goTo(0)} onPrev={() => goTo(step - 1)} onPlay={() => (step >= last ? (goTo(0), setPlaying(true)) : setPlaying(!playing))} onNext={() => goTo(step + 1)} onLast={() => goTo(last)} />;
  const speedBtn = (
    <button type="button" className="speed" onClick={() => setSpeed(speed === 1 ? 2 : 1)} aria-label={`Tốc độ ${speed}×, bấm để đổi`}>
      {speed}×
    </button>
  );

  if (device === "mobile") {
    return (
      <D1Root bg="table" className="tbl tbl-mobile">
        <div className="table-area-m">
          <FitStage device="mobile">{stage}</FitStage>
          <MobileTableBar backHref={backHref} title={`Xem lại ván #${replay.hand_no}`} sub={`${roomName}${at ? ` · ${at}` : ""}`} />
        </div>
        <aside className="ppanel rp-panel">
          <div className="rp-panel-head">
            <span>
              <b>Diễn biến</b>
              <small>{replay.steps.length} bước</small>
            </span>
            {speedBtn}
          </div>
          <Timeline device="mobile" items={timeline} step={step} onPick={goTo} />
          <div className="rp-result-m">
            Kết quả: <b>{resultLine(replay, names)}</b>
            {myResult && (
              <>
                {" "}
                · bạn <b className={myResult.hand_net + myResult.seven_deuce_net < 0 ? "is-loss" : "is-gain"}>{signed(myResult.hand_net + myResult.seven_deuce_net)}</b>
              </>
            )}
          </div>
          {slider}
          {transport}
        </aside>
      </D1Root>
    );
  }

  return (
    <D1Root bg="table" className="tbl tbl-desktop">
      <TableTopBar
        backHref={backHref}
        back="Lịch sử"
        title={`Xem lại ván #${replay.hand_no}`}
        meta={
          <>
            {roomName && (
              <>
                <span>{roomName}</span>
                <i />
              </>
            )}
            <span>
              Blind {fmt(table.room.small_blind)}/{fmt(table.room.big_blind)}
            </span>
            {at && (
              <>
                <i />
                <span>{at}</span>
              </>
            )}
            <i />
            <span>Bạn chỉ thấy bài của mình</span>
          </>
        }
      />
      <div className="table-area">
        <FitStage device="desktop">{stage}</FitStage>
      </div>
      <div className="abar-slot">
        <div className="abar abar-replay">
          {transport}
          {slider}
          <span className="rp-right">
            <span className="rp-step">
              <b>{step + 1}</b>/{replay.steps.length}
            </span>
            {speedBtn}
          </span>
        </div>
      </div>
      <aside className="side">
        <div className="side-title">
          <b>Diễn biến</b>
          <small>{replay.steps.length} bước</small>
        </div>
        <div className="side-body">
          <Timeline device="desktop" items={timeline} step={step} onPick={goTo} />
          <div className="rp-result">
            <span className="eyebrow">Kết quả ván</span>
            <b>{resultLine(replay, names)}</b>
            <span className="rp-result-rows">
              {replay.results.map((r) => {
                const net = r.hand_net + r.seven_deuce_net;
                return (
                  <span key={r.player_id}>
                    {r.display_name}{" "}
                    <b className={net > 0 ? "is-gain" : net < 0 ? "is-loss" : ""}>{signed(net)}</b>
                    {r.seven_deuce_net !== 0 && <small> (7-2 {signed(r.seven_deuce_net)})</small>}
                  </span>
                );
              })}
            </span>
            {!shown && <small>Không có showdown nên bài người khác vẫn úp trong bản xem lại.</small>}
          </div>
        </div>
      </aside>
    </D1Root>
  );
}

function resultLine(replay: HandReplay, names: Record<string, string>): string {
  const winners = replay.results.filter((r) => r.hand_net > 0);
  if (winners.length === 0) return "Hoà";
  const seven = replay.seven_deuce_winner ? ` · thưởng 7-2 cho ${names[replay.seven_deuce_winner]}` : "";
  return `${winners.map((w) => `${w.display_name} ăn ${fmt(w.hand_net)}`).join(", ")}${seven}`;
}

function Timeline({ device, items, step, onPick }: { device: Device; items: string[]; step: number; onPick: (i: number) => void }) {
  const now = useRef<HTMLLIElement>(null);
  useEffect(() => {
    const el = now.current;
    const box = el?.closest(".side-body, .tl-mobile");
    if (el && box) box.scrollTop = el.offsetTop - box.clientHeight / 2;
  }, [step]);
  return (
    <ol className={`timeline tl-${device}`}>
      {items.map((t, i) => (
        <li key={i} ref={i === step ? now : undefined} className={i < step ? "is-past" : i === step ? "is-now" : "is-future"} onClick={() => onPick(i)} aria-current={i === step ? "step" : undefined}>
          <span className="tl-dot">{i < step ? <Check size={11} strokeWidth={3} /> : i + 1}</span>
          <span className="tl-text">{t}</span>
          {i === step && <span className="tl-now">đang xem</span>}
        </li>
      ))}
    </ol>
  );
}

function StepSlider({ device, step, count, labels, onChange }: { device: Device; step: number; count: number; labels: string[]; onChange: (i: number) => void }) {
  const span = Math.max(1, count - 1);
  const frac = step / span;
  return (
    <div className={`rp-slider rp-slider-${device}`}>
      <span className="rp-track">
        <i className="rp-fill" style={{ width: `${frac * 100}%` }} />
        {Array.from({ length: count }, (_, i) => (
          <i key={i} className={`rp-tick${i < step ? " is-past" : i === step ? " is-now" : ""}`} style={{ left: `${(i / span) * 100}%` }} />
        ))}
        <i className="rp-thumb" style={{ left: `${frac * 100}%` }} />
        <input type="range" className="slider-input" min={0} max={count - 1} value={step} onChange={(e) => onChange(Number(e.target.value))} aria-label="Chọn bước" aria-valuetext={`Bước ${step + 1} trên ${count}`} />
      </span>
      {device === "desktop" && (
        <span className="rp-labels" aria-hidden>
          {labels.map((l, i) => (
            <span key={i} style={{ left: `${(i / span) * 100}%` }}>
              {l}
            </span>
          ))}
        </span>
      )}
    </div>
  );
}

function Transport({
  device,
  playing,
  atStart,
  atEnd,
  onFirst,
  onPrev,
  onPlay,
  onNext,
  onLast,
}: {
  device: Device;
  playing: boolean;
  atStart: boolean;
  atEnd: boolean;
  onFirst: () => void;
  onPrev: () => void;
  onPlay: () => void;
  onNext: () => void;
  onLast: () => void;
}) {
  const s = device === "desktop" ? 18 : 20;
  return (
    <span className="transport" role="group" aria-label="Điều khiển xem lại">
      <button type="button" className="tp-btn" onClick={onFirst} disabled={atStart} aria-label="Về đầu ván">
        <SkipBack size={s} strokeWidth={2} />
      </button>
      <button type="button" className="tp-btn" onClick={onPrev} disabled={atStart} aria-label="Bước trước">
        <ChevronLeft size={s + 2} strokeWidth={2.2} />
      </button>
      <button type="button" className="tp-btn is-play" onClick={onPlay} aria-label={playing ? "Tạm dừng" : "Phát"}>
        {playing ? <Pause size={s + 2} strokeWidth={2.2} /> : <Play size={s + 2} strokeWidth={2.2} />}
      </button>
      <button type="button" className="tp-btn" onClick={onNext} disabled={atEnd} aria-label="Bước sau">
        <ChevronRight size={s + 2} strokeWidth={2.2} />
      </button>
      <button type="button" className="tp-btn" onClick={onLast} disabled={atEnd} aria-label="Tới kết quả">
        <SkipForward size={s} strokeWidth={2} />
      </button>
    </span>
  );
}
