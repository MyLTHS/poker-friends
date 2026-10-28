"use client";

// The D1 table over one WebSocket (design screens-table.tsx / screens-social.tsx chat): desktop
// 1440×900 = top bar, stage, action bar, side column; landscape phone 844×390 = stage with its bar,
// right column, chat drawer. State is the reducer's (server truth); TableFx only animates it.
// `url` is the mock server's (`/table`) or Django's (`/rooms/<id>/table`); the protocol is the same.
import "./table.css";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { Coffee, Crown, Hourglass } from "lucide-react";

import type { ChatMessage, PlayerResult, SeatOccupant, TableState } from "@/api/protocol";
import { FeedbackDialog } from "@/feedback/FeedbackDialog";
import { Button, ButtonLink, CardText, D1Root, Spinner, ToastProvider, fmt, signed } from "@/ui";

import { IdleBar, PreAction, TurnBar, TurnPanel, type ActKind } from "./ActionBar";
import { Countdown, secondsLeft, useRecent, type TurnClock } from "./clock";
import { useDevice } from "./device";
import type { Device } from "./geometry";
import type { LogEntry } from "./log";
import { ConnStrip, PausedCard, ReconnectCard } from "./Overlays";
import { describeAction, raisePresets, tableView, type SeatView } from "./seatView";
import { SevenDeuceStage, SevenLedger, SevenMedal } from "./SevenDeuce";
import {
  ChatComposer,
  ChatDrawer,
  ChatList,
  HandFooter,
  MobileTableBar,
  MobileTools,
  PlayerList,
  SidePanel,
  Spectators,
  TableTools,
  TableTopBar,
  WatchersBlock,
  type SideTab,
} from "./Side";
import { FitStage, Stage } from "./Stage";
import { useTableFx, type SeatPlace } from "./TableFx";
import { SettingsModal, ShortcutHelp, SoundCues, useKeysPref, useTableSound } from "./TableSettings";
import { globalCommand, isTyping } from "./shortcuts";
import { useTableSocket } from "./useTableSocket";

const newCommandId = () => crypto.randomUUID();

const MOCK_HELP = (
  <>
    Mock server chạy chưa? Mở một terminal và chạy <code>uv run python -m mockserver</code>.
  </>
);

/** Chat lines shown as bubbles over the seats: the last 6 seconds. */
const BUBBLE_MS = 6000;

export type TableScreenProps = {
  url: string;
  backHref?: string;
  backLabel?: string;
  help?: ReactNode;
  /** Chat said before this connection (REST), fetched on every (re)connect. */
  loadChat?: () => Promise<ChatMessage[]>;
  /** Spectator picks an empty seat; resolves with an error text, or null when seated. */
  onTakeSeat?: (seat: number) => Promise<string | null>;
  /** Leave my seat (keep watching). */
  onLeaveSeat?: () => Promise<string | null>;
  /** Room owner: renders the owner's sheet (rooms/OwnerPanel) over the table. */
  owner?: (slot: OwnerSlot) => ReactNode;
  /** Replay of a finished hand. */
  replayHref?: (handId: number) => string;
};

/** What the owner's sheet gets from the table. */
export type OwnerSlot = { open: boolean; onClose: () => void; seats: SeatOccupant[]; inHand: (playerId: string) => boolean };

export function TableScreen({ url, backHref = "/", backLabel = "Sảnh", help = MOCK_HELP, loadChat, onTakeSeat, onLeaveSeat, owner, replayHref }: TableScreenProps) {
  const { model, dispatch, retry, reconnectNow, reload } = useTableSocket(url);
  const device = useDevice();
  const [tab, setTab] = useState<SideTab>("chat");
  const [drawer, setDrawer] = useState(false);
  const [seen, setSeen] = useState(0);
  const [seatError, setSeatError] = useState<string | null>(null);
  const [dialog, setDialog] = useState<"owner" | "settings" | "help" | "feedback" | null>(null);
  const sound = useTableSound();
  const [keysOn, setKeysOn] = useKeysPref();
  const { table } = model;
  const closeDialog = useCallback(() => setDialog(null), []);

  // Keys that work any time on the desktop table: ? help, M sound (my turn's keys: ActionBar).
  // Off with the settings' shortcut switch; a held key does not toggle again and again.
  const { prefs: soundPrefs, setPrefs: setSoundPrefs } = sound;
  useEffect(() => {
    if (device !== "desktop" || !keysOn) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.defaultPrevented || isTyping(e.target) || document.querySelector("dialog[open]")) return;
      const cmd = globalCommand(e);
      if (!cmd) return;
      e.preventDefault();
      if (e.repeat) return;
      if (cmd.kind === "help") setDialog("help");
      else if (cmd.kind === "sound") setSoundPrefs({ ...soundPrefs, on: !soundPrefs.on });
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [device, keysOn, soundPrefs, setSoundPrefs]);

  // Chat said while we were away: the socket only brings new lines.
  useEffect(() => {
    if (model.status !== "open" || !loadChat) return;
    let cancelled = false;
    loadChat().then((messages) => !cancelled && dispatch({ type: "chat.history", messages }));
    return () => {
      cancelled = true;
    };
  }, [model.status, loadChat, dispatch]);

  // Unread chat: lines that came while the chat was not on screen.
  const chatOpen = device === "desktop" ? tab === "chat" : drawer;
  const markRead = () => setSeen(model.chat.length);
  const openTab = (next: SideTab) => {
    if (tab === "chat" || next === "chat") markRead();
    setTab(next);
  };
  const openDrawer = (open: boolean) => {
    markRead();
    setDrawer(open);
  };

  const bubbles = useRecent(model.chat, model.clockOffsetMs, BUBBLE_MS);
  const view = useMemo(
    () =>
      table
        ? tableView(table, {
            lastActions: model.lastActions,
            results: model.results,
            myCards: model.myCards,
            bubbles,
          })
        : null,
    [table, model.lastActions, model.results, model.myCards, bubbles],
  );
  const placeOf = useCallback(
    (seat: number): SeatPlace | undefined => {
      const s = view?.seats.find((v) => v.seat === seat);
      return s && { spot: s.spot, me: !!s.isMe };
    },
    [view],
  );
  const { layer, fx } = useTableFx({ cues: model.fx, epoch: model.fxEpoch, device, placeOf });

  const dismissNotice = useCallback(() => dispatch({ type: "dismiss.notice" }), [dispatch]);
  const onAct = useCallback((kind: ActKind, amount?: number) => dispatch({ type: "act", kind, amount, commandId: newCommandId() }), [dispatch]);
  const say = useCallback((text: string) => dispatch({ type: "chat.send", text }), [dispatch]);

  if (!table || !view) {
    return (
      <D1Root bg="table" className="tbl-wait">
        <div className="tbl-wait-box">
          <Spinner size={56} />
          <b>Đang nối tới bàn chơi…</b>
          <p>
            {model.status === "reconnecting" ? "Chưa nối được, đang thử lại. " : ""}
            {help}
          </p>
          <small>{url}</small>
          <ButtonLink kind="ghost" href={backHref}>
            {backLabel}
          </ButtonLink>
        </div>
      </D1Root>
    );
  }

  const { hand, turn, room, you } = table;
  const legal = hand?.legal_actions ?? null;
  const suspended = room.status === "suspended";
  const online = model.status === "open";
  const myTurn = !!legal && !!hand && !hand.complete && !suspended;
  const me = view.seats.find((s) => s.isMe);
  const occupant = table.seats.find((s) => s.player_id === you.player_id);
  const sittingOut = !!occupant?.sitting_out;
  const isSeated = !!occupant;
  const pending = !!model.pending;
  // Read by the E2E tests (web/e2e/table.spec.ts): which state the page shows.
  const probe = {
    "data-version": model.lastVersion ?? undefined,
    "data-pending": pending || undefined,
    "data-hand": hand ? (hand.complete ? "complete" : "live") : "none",
  };

  // The turn clock runs on the server: deadline − measured offset. Suspended: frozen where it
  // stood when the room.suspended notice arrived.
  const deadline = turn ? Date.parse(turn.deadline) - model.clockOffsetMs : 0;
  const frozenAt = suspended && model.suspendedAt !== null ? secondsLeft(deadline, model.suspendedAt) : undefined;
  const clock: TurnClock | undefined = turn ? { deadline, total: turn.think_time_seconds, frozenAt } : undefined;
  const myClock = myTurn ? clock : undefined;
  const myFrozen = turn?.player_id === you.player_id ? frozenAt : undefined;

  const handNo = hand?.hand_no;
  const blinds = `${fmt(room.small_blind)}/${fmt(room.big_blind)}`;
  const winners = (model.results ?? []).filter((r) => r.hand_net > 0);
  const myResult = model.results?.find((r) => r.player_id === you.player_id);
  const nameOf = (playerId: string) => table.seats.find((s) => s.player_id === playerId)?.display_name ?? "?";
  const celebration = model.celebration;
  const sevenSpot = celebration ? placeOf(celebration.seat)?.spot : undefined;
  const unread = chatOpen ? 0 : Math.max(0, model.chat.length - seen);

  const sit = async (seat: number) => {
    if (!onTakeSeat) return;
    setSeatError(await onTakeSeat(seat));
  };
  const leave = onLeaveSeat
    ? {
        label: "Rời ghế",
        onLeave: async () => setSeatError(await onLeaveSeat()),
      }
    : undefined;
  const toggleSit = () => dispatch({ type: "sit", out: !sittingOut, commandId: newCommandId() });

  const turnProps = legal && hand
    ? {
        device,
        legal,
        presets: raisePresets(hand, legal),
        step: room.big_blind,
        facingBet: hand.players.some((p) => p.bet > 0),
        clock: myClock,
        enabled: online && !pending,
        keys: device === "desktop" && keysOn,
        onAct,
      }
    : null;
  const decisionKey = `${hand?.hand_id}-${hand?.board.length}-${legal?.min_raise_to}-${legal?.max_raise_to}-${legal?.call_amount}`;

  const meHint = myTurn && clock ? (
    <span className="turn-hint">
      <b>
        <Countdown deadline={clock.deadline} />s
      </b>
      <small>Tới lượt bạn</small>
    </span>
  ) : hand?.complete && myResult ? (
    <span className="turn-hint">
      <b className={myResult.hand_net + myResult.seven_deuce_net < 0 ? "is-loss" : "is-gain"}>{signed(myResult.hand_net + myResult.seven_deuce_net)}</b>
      <small>Ván này</small>
    </span>
  ) : undefined;

  const stage = (
    <Stage
      device={device}
      seats={view.seats}
      board={view.board}
      pot={view.pot}
      mark={`${room.name} · ${blinds}`}
      clock={clock}
      meHint={meHint}
      showPot={!hand?.complete}
      fx={fx}
      onSit={!isSeated && onTakeSeat ? sit : undefined}
      className={celebration ? "is-seven" : ""}
    >
      {layer}
      {hand?.complete && winners.length > 0 && !celebration && <WinnerBanner device={device} winners={winners} nameOf={nameOf} />}
      {celebration && sevenSpot && (
        <SevenDeuceStage key={hand?.hand_id} device={device} award={celebration} seats={table.seats} spot={sevenSpot} pot={Math.max(0, (model.results?.find((r) => r.player_id === celebration.player_id)?.hand_net ?? 0))} quiet={model.celebrationQuiet} startedAt={model.celebrationAt} />
      )}
      {device === "desktop" && hand?.complete && <Spectators device="desktop" spectators={model.spectators} />}
    </Stage>
  );

  // The owner's sheet, the settings and the key help sit over the table on both devices.
  const inHand = (playerId: string) => !!hand && !hand.complete && hand.players.some((p) => p.player_id === playerId && p.in_hand);
  const dialogs = (
    <>
      {owner?.({ open: dialog === "owner", onClose: closeDialog, seats: table.seats, inHand })}
      <SettingsModal
        open={dialog === "settings"}
        onClose={closeDialog}
        sound={sound}
        keys={device === "desktop" ? { on: keysOn, set: setKeysOn } : undefined}
        onHelp={() => setDialog("help")}
        onFeedback={() => setDialog("feedback")}
      />
      <FeedbackDialog open={dialog === "feedback"} onClose={closeDialog} />
      {device === "desktop" && <ShortcutHelp open={dialog === "help"} onClose={closeDialog} />}
      <SoundCues sound={sound} cues={model.fx} mySeat={occupant?.seat ?? null} myTurn={myTurn} turnKey={myTurn && turn ? `${hand?.hand_id}:${turn.deadline}` : null} deadline={myClock?.deadline ?? 0} frozen={myClock?.frozenAt !== undefined} />
    </>
  );

  const overlay = !online && (
    <>
      <div className={`scrim scrim-${device === "desktop" ? "d" : "m"}`} />
      {device === "desktop" && <ConnStrip device="desktop" />}
      <div className="rc-wrap">
        <ReconnectCard device={device} retry={retry} myClock={myClock} canCheck={!!legal?.can_check} backHref={backHref} onRetry={reconnectNow} />
      </div>
    </>
  );

  // Screen readers hear when it becomes my turn (once: the text only changes with the turn).
  const announce = (
    <p className="sr-only" role="status" aria-live="polite">
      {myTurn && legal ? `Tới lượt bạn. ${legal.can_check ? "Có thể check." : `Theo ${fmt(legal.call_amount)}.`} ${device === "desktop" && keysOn ? `Phím tắt: F bỏ, C ${legal.can_check ? "check" : "theo"}, R tố, dấu hỏi để xem thêm.` : ""}` : ""}
    </p>
  );

  const idle = idleContent({ table, me, myResult, winners, nameOf, sittingOut, clock, celebration: !!celebration });

  if (device === "mobile") {
    let panel: ReactNode;
    if (suspended) {
      panel = (
        <aside className="ppanel paused-panel">
          <PausedCard device="mobile" handNo={handNo} frozenAt={myFrozen} onReload={reload} backHref={backHref} />
        </aside>
      );
    } else if (myTurn && turnProps) {
      panel = <TurnPanel key={decisionKey} {...turnProps} device="mobile" />;
    } else if (celebration) {
      panel = (
        <aside className="ppanel sd-panel">
          <SevenLedger device="mobile" award={celebration} seats={table.seats} />
          <NextHand />
        </aside>
      );
    } else {
      panel = (
        <aside className="ppanel idle-panel">
          <div className="ip-next">
            <span className="abar-eyebrow">{idle.eyebrow}</span>
            {hand?.complete ? <NextHand /> : <span className="ip-status">{idle.status}</span>}
          </div>
          {idle.win && (
            <div className="ip-win">
              <Crown size={16} strokeWidth={2} />
              <span>
                <b>{idle.win}</b>
                {idle.winSub && <small>{idle.winSub}</small>}
              </span>
            </div>
          )}
          {idle.mine && <span className="ip-me">{idle.mine}</span>}
          {seatError && <span className="ip-error" role="alert">{seatError}</span>}
          <Spectators device="mobile" spectators={model.spectators} />
          <div className="ip-actions">
            {isSeated && (
              <Button kind="quiet" block icon={<Coffee size={16} />} onClick={toggleSit} aria-pressed={sittingOut} disabled={!online}>
                {sittingOut ? "Quay lại chơi" : "Nghỉ ván sau"}
              </Button>
            )}
            {hand?.complete && replayHref && (
              <ButtonLink kind="ghost" block href={replayHref(hand.hand_id)}>
                Xem lại ván
              </ButtonLink>
            )}
            {leave && isSeated && !hand?.complete && !myTurn && (
              <Button kind="ghost" block onClick={leave.onLeave}>
                {leave.label}
              </Button>
            )}
          </div>
        </aside>
      );
    }
    return (
      <D1Root bg="table" className="tbl tbl-mobile">
        <ToastProvider>
        <div className={`table-area-m${!online && myTurn ? " is-spot-me" : ""}`} {...probe}>
          <FitStage device="mobile" className={!online || suspended ? "is-dimmed" : ""}>
            {stage}
          </FitStage>
          <MobileTableBar
            backHref={backHref}
            title={room.name}
            sub={`Blind ${blinds}${handNo ? ` · Ván #${handNo}` : ""}`}
            right={
              !online ? (
                <span className="conn-strip conn-strip-m" role="status">
                  <span className="conn-dot" />
                  Mất kết nối · đang thử lại
                </span>
              ) : (
                <MobileTools watchers={model.spectators.length} unread={unread} onChat={() => openDrawer(true)} owner={owner ? () => setDialog("owner") : undefined} onMore={() => setDialog("settings")} />
              )
            }
          />
        </div>
        {panel}
        {overlay}
        <ChatDrawer open={drawer} onClose={() => openDrawer(false)} messages={model.chat} me={you.player_id} spectators={model.spectators} onSend={say} offline={!online} />
        <Notice model={model} onDismiss={dismissNotice} />
        {announce}
        {dialogs}
        </ToastProvider>
      </D1Root>
    );
  }

  /* ---------- desktop ---------- */
  const bar =
    myTurn && turnProps ? (
      <TurnBar key={decisionKey} {...turnProps} device="desktop" />
    ) : (
      <IdleBar
        left={
          <span className="idle-hand">
            <small>{idle.eyebrow}</small>
            <b>{idle.mine ?? idle.status}</b>
          </span>
        }
        center={
          celebration ? (
            <span className="idle-msg is-seven">
              <SevenMedal size={30} />
              <span>
                <b>
                  {nameOf(celebration.player_id)} +{fmt(celebration.total)}
                </b>{" "}
                từ thưởng 7-2
              </span>
            </span>
          ) : idle.win ? (
            <span className="idle-msg">
              <Crown size={18} strokeWidth={2} />
              <span>
                <b>{idle.win}</b> {idle.winSub}
              </span>
            </span>
          ) : (
            <span className="idle-msg is-quiet">{seatError ?? idle.center}</span>
          )
        }
        right={
          <>
            {isSeated && <PreAction label="Nghỉ ván sau" on={sittingOut} onToggle={toggleSit} disabled={!online} />}
            {hand?.complete && replayHref && (
              <Link className="tbar-btn is-quiet" href={replayHref(hand.hand_id)}>
                Xem lại ván
              </Link>
            )}
            {hand?.complete && <NextHand />}
          </>
        }
      />
    );

  return (
    <D1Root bg="table" className="tbl tbl-desktop">
      <ToastProvider>
      <TableTopBar
        backHref={backHref}
        back={backLabel}
        title={room.name}
        meta={
          <>
            <span>Blind {blinds}</span>
            {handNo && (
              <>
                <i />
                <span>Ván #{handNo}</span>
              </>
            )}
            {room.seven_deuce_bonus > 0 && (
              <>
                <i />
                <span className="is-brass">Thưởng 7-2 · {fmt(room.seven_deuce_bonus)}</span>
              </>
            )}
          </>
        }
        right={
          <TableTools
            watchers={model.spectators.length}
            sittingOut={sittingOut}
            canSit={isSeated}
            online={online}
            onSitToggle={toggleSit}
            owner={owner ? { open: dialog === "owner", onOpen: () => setDialog("owner") } : undefined}
            onSettings={() => setDialog("settings")}
            leave={isSeated ? leave : undefined}
          />
        }
      />
      <div className={`table-area${!online || suspended ? " is-dimmed" : ""}${!online && myTurn ? " is-spot-me" : ""}`} {...probe}>
        <FitStage device="desktop">{stage}</FitStage>
      </div>
      <div className={`abar-slot${!online || suspended ? " is-dimmed" : ""}`}>{bar}</div>
      {suspended ? (
        <aside className="side side-variant">
          <PausedCard device="desktop" handNo={handNo} frozenAt={myFrozen} onReload={reload} backHref={backHref} />
        </aside>
      ) : (
        <SidePanel
          tab={tab}
          onTab={openTab}
          counts={{ chat: tab === "chat" ? undefined : unread || undefined, players: view.seats.filter((s) => s.state !== "empty").length }}
          footer={tab === "chat" ? <ChatComposer onSend={say} disabled={!online} /> : tab === "log" && hand && !hand.complete ? <HandFooter pot={view.potTotal} bets={view.bets} inHand={view.inHand} /> : undefined}
        >
          {tab === "chat" && (
            <>
              <WatchersBlock device="desktop" spectators={model.spectators} />
              <ChatList messages={model.chat} me={you.player_id} spectators={model.spectators} />
            </>
          )}
          {tab === "players" && <PlayerList seats={view.seats} />}
          {tab === "log" && (
            <>
              {celebration && <SevenLedger device="desktop" award={celebration} seats={table.seats} />}
              <LogList entries={model.log} seats={table.seats} you={you.player_id} />
            </>
          )}
        </SidePanel>
      )}
      {overlay}
      <Notice model={model} onDismiss={dismissNotice} />
      {announce}
      {dialogs}
      </ToastProvider>
    </D1Root>
  );
}

/* ---------- pieces ---------- */

function NextHand() {
  return (
    <span className="next-hand">
      <Hourglass size={15} strokeWidth={2} />
      Ván mới sắp bắt đầu…
    </span>
  );
}

function WinnerBanner({ device, winners, nameOf }: { device: Device; winners: PlayerResult[]; nameOf: (id: string) => string }) {
  const names = winners.map((w) => nameOf(w.player_id));
  const total = winners.reduce((s, w) => s + w.hand_net, 0);
  return (
    <div className={`win-banner win-${device}`} role="status">
      <span className="win-crown">
        <Crown size={device === "desktop" ? 16 : 13} strokeWidth={2.2} />
      </span>
      <b>{winners.length === 1 ? `${names[0]} thắng ${fmt(total)}` : `${names.join(", ")} chia pot`}</b>
      {winners.length > 1 && <small>Mỗi người {winners.map((w) => `+${fmt(w.hand_net)}`).join(" · ")}</small>}
    </div>
  );
}

function Notice({ model, onDismiss }: { model: ReturnType<typeof useTableSocket>["model"]; onDismiss: () => void }) {
  const text = model.notice?.text;
  const id = model.notice?.id;
  useEffect(() => {
    if (!id) return;
    const timer = setTimeout(onDismiss, 5000);
    return () => clearTimeout(timer);
  }, [id, onDismiss]);
  if (!text) return null;
  return (
    <div className="tbl-notice" role="status" key={id}>
      <span>{text}</span>
      <button type="button" onClick={onDismiss} aria-label="Đóng">
        ×
      </button>
    </div>
  );
}

type Idle = { eyebrow: string; status: ReactNode; center: ReactNode; mine?: string; win?: string; winSub?: string };

/** Words of the idle bar / phone column for whatever is going on when it is not my turn. */
function idleContent({
  table,
  me,
  myResult,
  winners,
  nameOf,
  sittingOut,
  clock,
  celebration,
}: {
  table: TableState;
  me: SeatView | undefined;
  myResult: PlayerResult | undefined;
  winners: PlayerResult[];
  nameOf: (id: string) => string;
  sittingOut: boolean;
  clock: TurnClock | undefined;
  celebration: boolean;
}): Idle {
  const { hand, room } = table;
  const seated = table.seats.length;
  if (room.status === "suspended") return { eyebrow: "Bàn tạm dừng", status: "Chờ máy chủ khôi phục", center: "Bàn tạm dừng để khôi phục." };
  if (room.status === "closed") return { eyebrow: "Phòng đã đóng", status: "Không có ván mới", center: "Chủ phòng đã đóng phòng." };
  if (hand?.complete) {
    const net = myResult ? myResult.hand_net + myResult.seven_deuce_net : null;
    const showdown = hand.players.filter((p) => p.in_hand && p.cards.length && p.cards.every((c) => c !== "??")).length > 1;
    const win = winners.length === 1 ? `${nameOf(winners[0].player_id)} thắng ${fmt(winners[0].hand_net)}` : winners.length > 1 ? `${winners.map((w) => nameOf(w.player_id)).join(", ")} chia pot` : undefined;
    return {
      eyebrow: `Ván #${hand.hand_no} đã xong`,
      status: "Chờ ván mới",
      center: "Ván mới sắp bắt đầu.",
      mine: net === null ? (me ? undefined : "Bạn đang xem") : net > 0 ? `Bạn: thắng ${signed(net)}` : net < 0 ? `Bạn: thua ${fmt(net)}` : "Bạn: hoà vốn",
      win: celebration ? undefined : win,
      winSub: showdown ? "sau khi lật bài" : winners.length ? "khi cả bàn bỏ bài" : undefined,
    };
  }
  // Seated but not dealt in: say why (no chips, sitting out, or simply next hand).
  const noChips = !!me && (me.stack ?? 0) === 0;
  const seatedWait = noChips
    ? "Chưa có chip — nhờ chủ phòng cấp chip"
    : sittingOut
      ? "Đang nghỉ — bấm “Nghỉ ván sau” để quay lại"
      : "Bạn đã ngồi — vào từ ván sau";
  if (!hand) {
    const waiting = seated < 2 ? "Cần ít nhất 2 người ngồi để chia bài" : "Ván mới sắp bắt đầu";
    if (!me) return { eyebrow: "Bạn đang xem", status: waiting, center: "Bấm một ghế trống để ngồi." };
    return { eyebrow: noChips ? "Bạn đã ngồi" : sittingOut ? "Bạn đang nghỉ" : "Giữa hai ván", status: noChips ? seatedWait : waiting, center: noChips ? seatedWait : waiting + "." };
  }
  const actor = hand.actor ? nameOf(hand.actor) : null;
  const thinking: ReactNode = actor ? (
    <>
      {actor} suy nghĩ
      {clock && (
        <>
          {" · "}
          <Countdown deadline={clock.deadline} frozenAt={clock.frozenAt} />s
        </>
      )}
    </>
  ) : (
    "Đang chờ"
  );
  if (!me) return { eyebrow: "Bạn đang xem", status: thinking, center: "Người xem không thấy bài úp." };
  if (me.state === "folded") return { eyebrow: "Bạn đã bỏ bài", status: thinking, center: thinking };
  if ((me.cards?.length ?? 0) === 0) return { eyebrow: noChips ? "Bạn đã ngồi" : "Chờ ván sau", status: seatedWait, center: thinking };
  return { eyebrow: "Đang chờ", status: thinking, center: thinking };
}

/** The side panel log, names resolved now. */
function LogList({ entries, seats, you }: { entries: LogEntry[]; seats: SeatOccupant[]; you: string }) {
  const name = (seat: number) => seats.find((s) => s.seat === seat)?.display_name ?? `Ghế ${seat}`;
  const mySeat = seats.find((s) => s.player_id === you)?.seat;
  if (entries.length === 0) return <p className="log-empty">Nhật ký bắt đầu từ lúc bạn vào bàn.</p>;
  return (
    <ol className="log">
      {entries.map((e, i) => {
        switch (e.kind) {
          case "hand":
            return (
              <li key={i} className="is-street">
                Ván #{e.handNo} · {name(e.button)} cầm nút · {name(e.sb)} blind nhỏ {fmt(e.small)} · {name(e.bb)} blind lớn {fmt(e.big)}
              </li>
            );
          case "action":
            return (
              <li key={i} className={e.action.seat === mySeat ? "is-me" : ""}>
                {describeAction(e.action, name(e.action.seat))}
              </li>
            );
          case "street":
            return (
              <li key={i} className="is-street">
                {e.name}{" "}
                {e.cards.map((c) => (
                  <CardText key={c} card={c} />
                ))}
              </li>
            );
          case "show":
            return (
              <li key={i}>
                Lật bài: {name(e.seat)}{" "}
                {e.cards.map((c) => (
                  <CardText key={c} card={c} />
                ))}
              </li>
            );
          case "win":
            return (
              <li key={i} className="is-win">
                {name(e.seat)} ăn {fmt(e.amount)}
              </li>
            );
          case "seven":
            return (
              <li key={i} className="is-pay">
                Thưởng 7-2: {e.payers} người × {fmt(e.bonus)} = +{fmt(e.total)} cho {name(e.seat)}
              </li>
            );
          case "warn":
            return (
              <li key={i} className="is-warn">
                {e.text}
              </li>
            );
        }
      })}
    </ol>
  );
}
