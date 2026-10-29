"use client";

// The D1 table over one WebSocket (design screens-table.tsx / screens-social.tsx chat): desktop
// 1440×900 = top bar, stage, action bar, chat column; landscape phone 844×390 = stage with its bar,
// right column, chat drawer. Kept as plain as a game night: the table, your cards, the actions and
// the chat; the rest (sit out, owner, log, win/loss, settings, leave) waits in the ☰ menu.
// State is the reducer's (server truth); TableFx only animates it.
// `url` is the mock server's (`/table`) or Django's (`/rooms/<id>/table`); the protocol is the same.
import "./table.css";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { Bomb, Coins, Crown, Eye, Hourglass, Play } from "lucide-react";

import type { ChatMessage, PlayerResult, SeatOccupant, TableState } from "@/api/protocol";
import { FeedbackDialog } from "@/feedback/FeedbackDialog";
import { Button, ButtonLink, CardText, D1Root, Sheet, Spinner, ToastProvider, fmt, signed } from "@/ui";

import { IdleBar, PreActions, TurnBar, TurnPanel, type ActKind } from "./ActionBar";
import { Countdown, secondsLeft, useNow, useRecent, type TurnClock } from "./clock";
import { useDevice } from "./device";
import type { Device } from "./geometry";
import type { LogEntry } from "./log";
import { ConnStrip, PausedCard, ReconnectCard } from "./Overlays";
import { runoutLines, winnerLines } from "./handName";
import { bombPotHand, isBombPot, stakesText } from "./houseRules";
import { canPreAct, canShowCards, facingBet, shownHands } from "./reducer";
import { describeAction, raisePresets, tableView, type RunoutView, type SeatView } from "./seatView";
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
  TableMenu,
  TableTools,
  TableTopBar,
  WatchersBlock,
  type TableMenuItems,
} from "./Side";
import { FitStage, Stage } from "./Stage";
import { useTableFx, type SeatPlace } from "./TableFx";
import { SettingsModal, ShortcutHelp, SoundCues, useKeysPref, useTableSound } from "./TableSettings";
import { globalCommand, isTyping } from "./shortcuts";
import { useAuthRefusal } from "./authRefusal";
import { noChipsText, offersRebuy } from "./rebuy";
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
  /** Out of chips: take the room's starting stack again ("Mua thêm"); resolves with an error text, or null. */
  onRebuy?: () => Promise<string | null>;
  /** Room owner: renders the owner's sheet (rooms/OwnerPanel) over the table. */
  owner?: (slot: OwnerSlot) => ReactNode;
  /** "Mời bạn" in the top bar: renders the invite dialog (rooms/LiveTableScreen) over the table. */
  invite?: (slot: InviteSlot) => ReactNode;
  /** Open the invite dialog as the table first shows (a room just created). */
  startWithInvite?: boolean;
  /** Replay of a finished hand. */
  replayHref?: (handId: number) => string;
  /** The room's win/loss page, linked from the top bar. */
  historyHref?: string;
  /** Room owner: start dealing (a 10 s countdown, then hands follow one another) or stop after
   *  the running hand. Each resolves with an error text, or null. */
  control?: { onStart: () => Promise<string | null>; onPause: () => Promise<string | null> };
};

/** What the owner's sheet gets from the table. */
export type OwnerSlot = { open: boolean; onClose: () => void; seats: SeatOccupant[]; inHand: (playerId: string) => boolean };

/** What the invite dialog gets from the table. */
export type InviteSlot = { open: boolean; onClose: () => void };

export function TableScreen({
  url,
  backHref = "/",
  backLabel = "Sảnh",
  help = MOCK_HELP,
  loadChat,
  onTakeSeat,
  onLeaveSeat,
  onRebuy,
  owner,
  invite,
  startWithInvite = false,
  replayHref,
  historyHref,
  control,
}: TableScreenProps) {
  const { model, dispatch, retry, reconnectNow, reload } = useTableSocket(url);
  const refusal = useAuthRefusal(retry.final && !!retry.auth);
  const device = useDevice();
  const [drawer, setDrawer] = useState(false);
  const [seen, setSeen] = useState(0);
  const [seatError, setSeatError] = useState<string | null>(null);
  const [rebuying, setRebuying] = useState(false);
  const [controlBusy, setControlBusy] = useState(false);
  // One sheet or dialog at a time: picking a menu item swaps the menu for what it opens.
  const [dialog, setDialog] = useState<"menu" | "log" | "owner" | "invite" | "settings" | "help" | "feedback" | null>(startWithInvite && invite ? "invite" : null);
  const sound = useTableSound();
  const [keysOn, setKeysOn] = useKeysPref();
  const { table } = model;
  // A seat error is about the moment it happened: a new hand clears it, so an old "Rời ghế" refusal
  // never stands where "Mua thêm" should be.
  const handKey = table?.hand?.hand_id ?? null;
  const [errorHand, setErrorHand] = useState(handKey);
  if (errorHand !== handKey) {
    setErrorHand(handKey);
    setSeatError(null);
  }
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

  // Unread chat (phone): lines that came while the drawer was closed. The desktop column is always chat.
  const chatOpen = device === "desktop" || drawer;
  const markRead = () => setSeen(model.chat.length);
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
            showdown: model.showdown,
            myCards: model.myCards,
            bubbles,
            runouts: model.runouts,
            rabbit: model.rabbit,
            shown: shownHands({ table, shown: model.shown }),
          })
        : null,
    [table, model.lastActions, model.results, model.showdown, model.myCards, bubbles, model.runouts, model.rabbit, model.shown],
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
  const showCards = useCallback(() => dispatch({ type: "show", commandId: newCommandId() }), [dispatch]);

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
  // "Ngửa bài": offered after the hand to whoever was dealt in and is still face down; busy while sent.
  const showOffer = canShowCards(model) || !!model.showing;
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
  // My action is on its way: show it as done at once (the tunnel round trip can take half a
  // second); a refusal clears `pending` and brings the bar back.
  const sent = myTurn && model.pending?.message.hand_id === hand?.hand_id ? model.pending!.message.payload : null;
  const sentLabel = sent && legal ? (sent.kind === "fold" ? "Bỏ bài" : sent.kind === "check" ? "Check" : sent.kind === "call" ? `Theo ${fmt(legal.call_amount)}` : sent.amount === legal.max_raise_to ? `All-in ${fmt(sent.amount ?? 0)}` : `Tố ${fmt(sent.amount ?? 0)}`) : null;
  const acting = myTurn && !sent;
  const myClock = acting ? clock : undefined;
  const myFrozen = turn?.player_id === you.player_id ? frozenAt : undefined;

  // Hands are dealt only once the owner pressed "Bắt đầu" (a server without it always deals); the
  // next one comes at next_hand_at, read on our clock like the turn deadline.
  const running = room.running !== false;
  const nextAt = room.next_hand_at ? Date.parse(room.next_hand_at) - model.clockOffsetMs : null;
  const toggleRunning = control
    ? async () => {
        setControlBusy(true);
        setSeatError(await (running ? control.onPause() : control.onStart()));
        setControlBusy(false);
      }
    : undefined;

  const handNo = hand?.hand_no;
  const blinds = `${fmt(room.small_blind)}/${fmt(room.big_blind)}`;
  // Between hands: the one about to be dealt is a bomb pot (by the room's rules as they stand).
  const nextBomb = !!hand?.complete && bombPotHand(room, hand.hand_no + 1);
  const winners = (model.results ?? []).filter((r) => r.hand_net > 0);
  const myResult = model.results?.find((r) => r.player_id === you.player_id);
  const nameOf = (playerId: string) => table.seats.find((s) => s.player_id === playerId)?.display_name ?? "?";
  const handOf = (playerId: string) => view.seats.find((s) => s.playerId === playerId)?.hand;
  const celebration = model.celebration;
  const sevenSpot = celebration ? placeOf(celebration.seat)?.spot : undefined;
  const unread = chatOpen ? 0 : Math.max(0, model.chat.length - seen);

  const sit = async (seat: number) => {
    if (!onTakeSeat) return;
    setSeatError(await onTakeSeat(seat));
  };
  const leave = onLeaveSeat && isSeated ? async () => setSeatError(await onLeaveSeat()) : undefined;
  const toggleSit = () => dispatch({ type: "sit", out: !sittingOut, commandId: newCommandId() });
  const menuItems: TableMenuItems = {
    watchers: model.spectators.length,
    sit: isSeated ? { sittingOut, disabled: !online, onToggle: toggleSit } : undefined,
    onOwner: owner ? () => setDialog("owner") : undefined,
    onLog: () => setDialog("log"),
    historyHref,
    onSettings: () => setDialog("settings"),
    onFeedback: () => setDialog("feedback"),
    leave: leave && { onLeave: leave, busy: !!hand && !hand.complete && hand.players.some((p) => p.player_id === you.player_id) },
    control: toggleRunning && { running, busy: controlBusy || !online, onToggle: toggleRunning },
  };
  const menu = { open: dialog === "menu", onOpen: () => setDialog("menu") };
  const pre = canPreAct(model) && !celebration ? (
    <PreActions device={device} choice={model.preAction?.kind ?? null} facingBet={facingBet(model)} disabled={!online} onChoose={(kind) => dispatch({ type: "pre.select", kind, commandId: newCommandId() })} />
  ) : null;

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

  const meHint = sentLabel ? (
    <span className="turn-hint is-sent">
      <b>✓</b>
      <small>{sentLabel}</small>
    </span>
  ) : acting && clock ? (
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
      boardHi={view.boardHi}
      runouts={view.runouts}
      rabbit={view.rabbit}
      pot={view.pot}
      mark={`${room.name} · ${blinds}`}
      badge={
        isBombPot(hand) ? (
          <>
            <Bomb size={device === "desktop" ? 15 : 12} strokeWidth={2.2} aria-hidden />
            Bomb pot
          </>
        ) : undefined
      }
      clock={sent ? undefined : clock}
      meHint={meHint}
      showPot={!hand?.complete}
      fx={fx}
      onSit={!isSeated && onTakeSeat ? sit : undefined}
      meHand={hand && !hand.complete ? hand.hand_id : null}
      className={celebration ? "is-seven" : ""}
    >
      {layer}
      {(!hand || (hand.complete && !running)) && !suspended && room.status !== "closed" && !celebration && (
        <StartGate
          compact={!!hand}
          running={running}
          nextAt={nextAt}
          seated={table.seats.filter((s) => !s.sitting_out && s.stack > 0).length}
          onStart={!running ? toggleRunning : undefined}
          busy={controlBusy}
          online={online}
        />
      )}
      {!isSeated && !celebration && (
        <div className="watch-pill" role="status">
          <Eye size={device === "desktop" ? 15 : 12} strokeWidth={2} aria-hidden />
          <span>
            <b>Bạn đang xem</b>
            {onTakeSeat ? " · bấm ghế trống để vào chơi" : ""}
          </span>
        </div>
      )}
      {hand?.complete && (winners.length > 0 || view.runouts) && !celebration && <WinnerBanner device={device} winners={winners} nameOf={nameOf} handOf={handOf} runouts={view.runouts} />}
      {celebration && sevenSpot && (
        <SevenDeuceStage key={hand?.hand_id} device={device} award={celebration} seats={table.seats} spot={sevenSpot} pot={Math.max(0, (model.results?.find((r) => r.player_id === celebration.player_id)?.hand_net ?? 0))} quiet={model.celebrationQuiet} startedAt={model.celebrationAt} />
      )}
      {device === "desktop" && hand?.complete && <Spectators device="desktop" spectators={model.spectators} />}
    </Stage>
  );

  // The menu, the log, the owner's sheet, the settings and the key help sit over the table on both
  // devices. The menu comes first: when an item swaps it for another dialog, it closes (focus back
  // on ☰) before the next one opens, so that one gives the focus back to ☰ too.
  const inHand = (playerId: string) => !!hand && !hand.complete && hand.players.some((p) => p.player_id === playerId && p.in_hand);
  const dialogs = (
    <>
      <TableMenu open={dialog === "menu"} onClose={closeDialog} items={menuItems} />
      <Sheet open={dialog === "log"} onClose={closeDialog} title="Nhật ký ván">
        {hand && !hand.complete && <HandFooter pot={view.potTotal} bets={view.bets} inHand={view.inHand} />}
        {celebration && <SevenLedger device={device} award={celebration} seats={table.seats} />}
        {dialog === "log" && <LogList entries={model.log} seats={table.seats} you={you.player_id} />}
        <h3 className="log-sub">Người chơi</h3>
        {dialog === "log" && <PlayerList seats={view.seats} />}
      </Sheet>
      {owner?.({ open: dialog === "owner", onClose: closeDialog, seats: table.seats, inHand })}
      {invite?.({ open: dialog === "invite", onClose: closeDialog })}
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
        <ReconnectCard device={device} retry={retry} refusal={refusal} myClock={myClock} canCheck={!!legal?.can_check} backHref={backHref} onRetry={reconnectNow} />
      </div>
    </>
  );

  // Screen readers hear when it becomes my turn (once: the text only changes with the turn).
  const announce = (
    <p className="sr-only" role="status" aria-live="polite">
      {myTurn && legal ? `Tới lượt bạn. ${legal.can_check ? "Có thể check." : `Theo ${fmt(legal.call_amount)}.`} ${device === "desktop" && keysOn ? `Phím tắt: F bỏ, C ${legal.can_check ? "check" : "theo"}, R tố, dấu hỏi để xem thêm.` : ""}` : ""}
    </p>
  );

  const idle = idleContent({ table, me, myResult, winners, nameOf, handOf, sittingOut, clock, celebration: !!celebration, canRebuy: !!onRebuy, nextBomb, runouts: view.runouts });
  // Any seated player with no chips buys back in (the room's starting stack), owner included. Not
  // while their all-in is still being played; yes on a finished hand they lost it all in (the
  // table keeps that hand on screen until the next one, which may never come heads-up).
  const rebuy =
    onRebuy && me && offersRebuy(table, me.stack ?? 0)
      ? async () => {
          setRebuying(true);
          setSeatError(await onRebuy());
          setRebuying(false);
        }
      : undefined;
  const rebuyButton = (block: boolean) =>
    rebuy && (
      <Button kind="primary" block={block} busy={rebuying} disabled={!online} icon={<Coins size={16} strokeWidth={2} aria-hidden />} onClick={rebuy}>
        Mua thêm
      </Button>
    );

  if (device === "mobile") {
    let panel: ReactNode;
    if (suspended) {
      panel = (
        <aside className="ppanel paused-panel">
          <PausedCard device="mobile" handNo={handNo} frozenAt={myFrozen} onReload={reload} backHref={backHref} />
        </aside>
      );
    } else if (acting && turnProps) {
      panel = <TurnPanel key={decisionKey} {...turnProps} device="mobile" />;
    } else if (sentLabel) {
      panel = (
        <aside className="ppanel idle-panel is-sent">
          <div className="ip-next">
            <span className="abar-eyebrow">Đã chọn</span>
            <span className="ip-status">{sentLabel}</span>
          </div>
        </aside>
      );
    } else if (celebration) {
      panel = (
        <aside className="ppanel sd-panel">
          <SevenLedger device="mobile" award={celebration} seats={table.seats} />
          <NextHand bomb={nextBomb} at={nextAt} running={running} />
        </aside>
      );
    } else {
      panel = (
        <aside className="ppanel idle-panel">
          <div className="ip-next">
            <span className="abar-eyebrow">{idle.eyebrow}</span>
            {hand?.complete ? <NextHand bomb={nextBomb} at={nextAt} running={running} /> : <span className="ip-status">{idle.status}</span>}
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
          {pre}
          {seatError && <span className="ip-error" role="alert">{seatError}</span>}
          <Spectators device="mobile" spectators={model.spectators} />
          <div className="ip-actions">
            {rebuyButton(true)}
            {showOffer && (
              <Button kind="ghost" block busy={!!model.showing} disabled={!online} icon={<Eye size={16} strokeWidth={2} aria-hidden />} onClick={showCards}>
                Ngửa bài
              </Button>
            )}
            {hand?.complete && replayHref && (
              <ButtonLink kind="ghost" block href={replayHref(hand.hand_id)}>
                Xem lại ván
              </ButtonLink>
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
            sub={`${stakesText(room)}${handNo ? ` · Ván #${handNo}` : ""}`}
            right={
              !online ? (
                <span className="conn-strip conn-strip-m" role="status">
                  <span className="conn-dot" />
                  Mất kết nối · đang thử lại
                </span>
              ) : (
                <MobileTools unread={unread} onChat={() => openDrawer(true)} onInvite={invite ? () => setDialog("invite") : undefined} menu={menu} spectators={model.spectators} />
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
    acting && turnProps ? (
      <TurnBar key={decisionKey} {...turnProps} device="desktop" />
    ) : sentLabel ? (
      <IdleBar
        className="abar-sent"
        left={
          <span className="idle-hand">
            <small>Đã chọn</small>
            <b>{sentLabel}</b>
          </span>
        }
        center={<span className="idle-msg is-quiet">Đang gửi tới bàn…</span>}
      />
    ) : (
      <IdleBar
        className={pre ? "abar-pre" : ""}
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
          ) : rebuy ? (
            // before the winner's banner: busted, the next move is to buy back in (a failed try
            // says why beside the button, which stays to try again)
            <span className="idle-rebuy">
              {rebuyButton(false)}
              {seatError && <span className="idle-msg is-quiet">{seatError}</span>}
            </span>
          ) : idle.win ? (
            <span className="idle-msg">
              <Crown size={18} strokeWidth={2} />
              <span title={`${idle.win} ${idle.winSub ?? ""}`.trim()}>
                <b>{idle.win}</b> {idle.winSub}
              </span>
            </span>
          ) : pre && !seatError ? (
            pre
          ) : (
            <span className="idle-msg is-quiet">{seatError ?? idle.center}</span>
          )
        }
        right={
          <>
            {showOffer && (
              <button type="button" className={`tbar-btn${model.showing ? " is-busy" : ""}`} disabled={!online || !!model.showing} aria-busy={!!model.showing || undefined} onClick={showCards}>
                <Eye size={15} strokeWidth={2} aria-hidden />
                Ngửa bài
              </button>
            )}
            {hand?.complete && replayHref && (
              <Link className="tbar-btn is-quiet" href={replayHref(hand.hand_id)}>
                Xem lại ván
              </Link>
            )}
            {hand?.complete && <NextHand bomb={nextBomb} at={nextAt} running={running} />}
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
            {room.ante > 0 && (
              <>
                <i />
                <span>Ante {fmt(room.ante)}</span>
              </>
            )}
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
          <TableTools onInvite={invite ? () => setDialog("invite") : undefined} menu={menu} spectators={model.spectators} />
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
        <SidePanel footer={<ChatComposer onSend={say} disabled={!online} />}>
          <WatchersBlock device="desktop" spectators={model.spectators} />
          <ChatList messages={model.chat} me={you.player_id} spectators={model.spectators} />
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

function NextHand({ bomb = false, at = null, running = true }: { bomb?: boolean; at?: number | null; running?: boolean }) {
  return (
    <span className="next-hand">
      {bomb ? <Bomb size={15} strokeWidth={2} aria-hidden /> : <Hourglass size={15} strokeWidth={2} />}
      {!running ? (
        "Bàn đang tạm dừng"
      ) : at ? (
        <>
          {bomb ? "Bomb pot sau " : "Ván mới sau "}
          <Countdown deadline={at} />s
        </>
      ) : bomb ? (
        "Ván sau là bomb pot…"
      ) : (
        "Ván mới sắp bắt đầu…"
      )}
    </span>
  );
}

/** Between hands with nothing dealt yet (or the owner paused): who starts it, or the countdown to
 *  the first hand in big numbers. `compact` sits under a finished hand still on the felt. */
function StartGate({ compact, running, nextAt, seated, onStart, busy, online }: { compact: boolean; running: boolean; nextAt: number | null; seated: number; onStart?: () => void; busy: boolean; online: boolean }) {
  if (running && nextAt) return <BigCountdown at={nextAt} />;
  if (running) {
    return (
      <div className="start-gate is-quiet" role="status">
        <small>{seated < 2 ? "Cần ít nhất 2 người có chip để chia bài" : "Sắp chia bài…"}</small>
      </div>
    );
  }
  const few = seated < 2;
  return (
    <div className={`start-gate${compact ? " is-compact" : ""}`} role="status">
      {!compact && <b className="sg-title">{onStart ? "Sẵn sàng chưa?" : "Chờ chủ phòng bắt đầu"}</b>}
      {onStart ? (
        <>
          <Button kind="primary" size={compact ? "md" : "lg"} busy={busy} disabled={!online || few} icon={<Play size={18} strokeWidth={2.2} aria-hidden />} onClick={onStart}>
            {compact ? "Tiếp tục chia" : "Bắt đầu"}
          </Button>
          <small>{few ? "Cần ít nhất 2 người ngồi (có chip) để bắt đầu" : compact ? "Bàn đang tạm dừng" : "Bấm để đếm ngược 10 giây rồi chia bài"}</small>
        </>
      ) : (
        <small>{compact ? "Bàn đang tạm dừng — chờ chủ phòng" : "Chọn ghế, chủ phòng bấm “Bắt đầu” là chia bài"}</small>
      )}
    </div>
  );
}

/** The first hand's countdown: each second pops in. */
function BigCountdown({ at }: { at: number }) {
  const n = secondsLeft(at, useNow(250));
  return (
    <div className="start-gate is-counting" role="timer" aria-live="polite" aria-label={`Chia bài sau ${n} giây`}>
      <small>Chia bài sau</small>
      <b key={n} className="sg-count">
        {n}
      </b>
    </div>
  );
}

function WinnerBanner({
  device,
  winners,
  nameOf,
  handOf,
  runouts,
}: {
  device: Device;
  winners: PlayerResult[];
  nameOf: (id: string) => string;
  handOf: (id: string) => string | undefined;
  runouts: RunoutView[] | null;
}) {
  // run twice: each board paid its half (the rows on the felt say who too)
  const { title, detail } = runouts ? runoutLines(runouts) : winnerLines(winners.map((w) => ({ name: nameOf(w.player_id), amount: w.hand_net, hand: handOf(w.player_id) })));
  return (
    <div className={`win-banner win-${device}`} role="status">
      <span className="win-crown">
        <Crown size={device === "desktop" ? 16 : 13} strokeWidth={2.2} />
      </span>
      <b>{title}</b>
      {detail && <small>{detail}</small>}
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
  handOf,
  sittingOut,
  clock,
  celebration,
  canRebuy,
  nextBomb,
  runouts,
}: {
  table: TableState;
  me: SeatView | undefined;
  myResult: PlayerResult | undefined;
  winners: PlayerResult[];
  nameOf: (id: string) => string;
  handOf: (id: string) => string | undefined;
  sittingOut: boolean;
  clock: TurnClock | undefined;
  celebration: boolean;
  /** "Mua thêm" is offered (the live table; the mock server has none) */
  canRebuy: boolean;
  /** the hand about to be dealt is a bomb pot */
  nextBomb: boolean;
  /** the completed hand was run twice: its two boards and who each paid */
  runouts: RunoutView[] | null;
}): Idle {
  const { hand, room } = table;
  const seated = table.seats.length;
  if (room.status === "suspended") return { eyebrow: "Bàn tạm dừng", status: "Chờ máy chủ khôi phục", center: "Bàn tạm dừng để khôi phục." };
  if (room.status === "closed") return { eyebrow: "Phòng đã đóng", status: "Không có ván mới", center: "Chủ phòng đã đóng phòng." };
  if (hand?.complete) {
    const net = myResult ? myResult.hand_net + myResult.seven_deuce_net : null;
    const showdown = hand.players.filter((p) => p.in_hand && p.cards.length && p.cards.every((c) => c !== "??")).length > 1;
    const mine = myResult && handOf(myResult.player_id);
    // Each winner with their own hand: a split or side pot can be won with different hands.
    const lines = runouts ? runoutLines(runouts) : winners.length ? winnerLines(winners.map((w) => ({ name: nameOf(w.player_id), amount: w.hand_net, hand: handOf(w.player_id) }))) : null;
    const win = lines?.title;
    const shownSub = lines?.detail && (winners.length === 1 && !runouts ? `với ${lines.detail}` : lines.detail);
    return {
      eyebrow: `Ván #${hand.hand_no} đã xong`,
      status: room.running === false ? "Bàn đang tạm dừng" : nextBomb ? "Ván sau là bomb pot" : "Chờ ván mới",
      center: room.running === false ? "Bàn đang tạm dừng." : nextBomb ? "Ván sau là bomb pot." : "Ván mới sắp bắt đầu.",
      mine: net === null ? (me ? undefined : "Bạn đang xem") : `Bạn: ${mine ? `${mine} · ` : ""}${net > 0 ? `thắng ${signed(net)}` : net < 0 ? `thua ${fmt(net)}` : "hoà vốn"}`,
      win: celebration ? undefined : win,
      winSub: shownSub || (showdown ? "sau khi lật bài" : winners.length ? "khi cả bàn bỏ bài" : undefined),
    };
  }
  // Seated but not dealt in: say why (no chips, sitting out, or simply next hand). A seat comes
  // with the room's starting stack, so no chips means lost them all: "Mua thêm" sits next to it.
  const noChips = !!me && (me.stack ?? 0) === 0;
  const seatedWait = noChips
    ? noChipsText(canRebuy)
    : sittingOut
      ? "Đang nghỉ — mở Menu, bấm “Quay lại bàn”"
      : "Bạn đã ngồi — vào từ ván sau";
  if (!hand) {
    const waiting = room.running === false ? "Chờ chủ phòng bấm Bắt đầu" : seated < 2 ? "Cần ít nhất 2 người ngồi để chia bài" : "Ván mới sắp bắt đầu";
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

/** The hand log (menu → "Nhật ký ván"), names resolved now. */
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
                Ván #{e.handNo} · {name(e.button)} cầm nút ·{" "}
                {e.bomb > 0 ? (
                  <>Bomb pot: mỗi người góp {fmt(e.bomb)}</>
                ) : (
                  <>
                    {e.ante > 0 && <>Ante {fmt(e.ante)} · </>}
                    {name(e.sb)} blind nhỏ {fmt(e.small)} · {name(e.bb)} blind lớn {fmt(e.big)}
                  </>
                )}
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
                {e.hand && ` — ${e.hand}`}
              </li>
            );
          case "muck":
            return <li key={i}>{name(e.seat)} úp bài (thua)</li>;
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
          case "runout":
            return (
              <li key={i} className="is-street">
                Chạy 2 lần · Lần {e.n}{" "}
                {e.cards.map((c) => (
                  <CardText key={c} card={c} />
                ))}
                {e.winners.length > 0 && <> — {e.winners.map((w) => (w.amount === undefined ? `${name(w.seat)} thắng` : `${name(w.seat)} ăn ${fmt(w.amount)}`)).join(", ")}</>}
              </li>
            );
          case "rabbit":
            return (
              <li key={i} className="is-quiet">
                Bài chưa chia:{" "}
                {e.cards.map((c) => (
                  <CardText key={c} card={c} />
                ))}
              </li>
            );
          case "reveal":
            return (
              <li key={i} className={e.seat === mySeat ? "is-me" : ""}>
                {name(e.seat)} ngửa bài{" "}
                {e.cards.map((c) => (
                  <CardText key={c} card={c} />
                ))}
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
