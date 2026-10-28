"use client";

// Chrome around the table (design table.tsx): the desktop top bar and right column (chat /
// players / log), the phone's bar over the stage and its chat drawer, chat lines and composer,
// who is watching. Chat goes through the table's own socket (chat.send → chat.message).
import Link from "next/link";
import { useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import { ChevronLeft, Coffee, Crown, Ellipsis, Eye, LogOut, MessageCircle, Send, Settings, Smile, X } from "lucide-react";

import type { ChatMessage, Spectator } from "@/api/protocol";
import { Avatar, IconButton, fmt } from "@/ui";

import type { SeatView } from "./seatView";

export const QUICK_EMOJI = ["👍", "😂", "😱", "🔥", "🙏"];
const CHAT_MAX = 300;

const hhmm = (iso: string) => {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "" : `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
};

/* ---------- desktop top bar ---------- */

export function TableTopBar({
  backHref,
  back = "Sảnh",
  title,
  meta,
  right,
}: {
  backHref: string;
  back?: string;
  title: ReactNode;
  meta: ReactNode;
  right?: ReactNode;
}) {
  return (
    <header className="tbar">
      <Link className="tbar-back" href={backHref}>
        <ChevronLeft size={18} strokeWidth={2} />
        {back}
      </Link>
      <span className="tbar-title">
        <b>{title}</b>
        <span className="tbar-meta">{meta}</span>
      </span>
      <span className="tbar-right">{right}</span>
    </header>
  );
}

export function TableTools({
  watchers,
  sittingOut,
  canSit,
  online,
  onSitToggle,
  owner,
  onSettings,
  leave,
}: {
  watchers: number;
  sittingOut: boolean;
  canSit: boolean;
  online: boolean;
  onSitToggle: () => void;
  /** room owner: the crown opens the owner's sheet */
  owner?: { open: boolean; onOpen: () => void };
  onSettings: () => void;
  leave?: { onLeave: () => void; label: string };
}) {
  return (
    <>
      <span className="tbar-watch" title="Người đang xem">
        <Eye size={16} strokeWidth={1.9} aria-hidden />
        {watchers} đang xem
      </span>
      {canSit && (
        <button type="button" className={`tbar-btn${sittingOut ? " is-on" : ""}`} aria-pressed={sittingOut} onClick={onSitToggle} disabled={!online}>
          <Coffee size={15} strokeWidth={1.9} aria-hidden />
          {sittingOut ? "Đang nghỉ · quay lại" : "Nghỉ ván sau"}
        </button>
      )}
      {owner && (
        <IconButton label="Bảng chủ phòng" active={owner.open} aria-haspopup="dialog" onClick={owner.onOpen}>
          <Crown size={17} strokeWidth={1.9} aria-hidden />
        </IconButton>
      )}
      <IconButton label="Cài đặt bàn" aria-haspopup="dialog" onClick={onSettings}>
        <Settings size={17} strokeWidth={1.9} aria-hidden />
      </IconButton>
      {leave && (
        <button type="button" className="tbar-btn is-quiet" onClick={leave.onLeave}>
          <LogOut size={15} strokeWidth={1.9} aria-hidden />
          {leave.label}
        </button>
      )}
    </>
  );
}

/* ---------- phone bar over the stage ---------- */

export function MobileTableBar({ backHref, title, sub, right }: { backHref: string; title: ReactNode; sub: ReactNode; right?: ReactNode }) {
  return (
    <header className="tbar-m">
      <Link className="iconbtn" href={backHref} aria-label="Quay lại" title="Quay lại">
        <ChevronLeft size={22} strokeWidth={2} />
      </Link>
      <span className="tbar-m-title">
        <b>{title}</b>
        <small>{sub}</small>
      </span>
      <span className="tbar-m-right">{right}</span>
    </header>
  );
}

export function MobileTools({ watchers, unread, onChat, owner, onMore }: { watchers: number; unread: number; onChat: () => void; owner?: () => void; onMore: () => void }) {
  // id: the chat drawer gives focus back to this button when it closes
  return (
    <>
      <span className="tbar-m-watch" title="Người đang xem" aria-label={`${watchers} người đang xem`}>
        <Eye size={15} strokeWidth={2} aria-hidden />
        {watchers}
      </span>
      <IconButton id="tbl-chat-btn" label="Chat" badge={unread > 0 ? unread : undefined} onClick={onChat}>
        <MessageCircle size={20} strokeWidth={1.9} aria-hidden />
      </IconButton>
      {owner && (
        <IconButton label="Bảng chủ phòng" aria-haspopup="dialog" onClick={owner}>
          <Crown size={19} strokeWidth={1.9} aria-hidden />
        </IconButton>
      )}
      <IconButton label="Thêm tuỳ chọn" aria-haspopup="dialog" onClick={onMore}>
        <Ellipsis size={20} strokeWidth={2} aria-hidden />
      </IconButton>
    </>
  );
}

/* ---------- desktop right column ---------- */

export type SideTab = "chat" | "players" | "log";

export function SidePanel({
  tab,
  onTab,
  counts,
  children,
  footer,
}: {
  tab: SideTab;
  onTab: (tab: SideTab) => void;
  counts: Partial<Record<SideTab, number>>;
  children: ReactNode;
  footer?: ReactNode;
}) {
  const tabs: [SideTab, string][] = [
    ["chat", "Chat"],
    ["players", "Người chơi"],
    ["log", "Nhật ký"],
  ];
  return (
    <aside className="side" aria-label="Bên bàn">
      <div className="side-tabs" role="tablist">
        {tabs.map(([key, label]) => (
          <button key={key} type="button" role="tab" aria-selected={tab === key} className={`side-tab${tab === key ? " is-active" : ""}`} onClick={() => onTab(key)}>
            {label}
            {counts[key] !== undefined && <i>{counts[key]}</i>}
          </button>
        ))}
      </div>
      <div className="side-body" role="tabpanel">
        {children}
      </div>
      {footer && <div className="side-foot">{footer}</div>}
    </aside>
  );
}

export function HandFooter({ pot, bets, inHand }: { pot: number; bets: number; inHand: number }) {
  return (
    <div className="hand-foot">
      <span>
        <small>Pot</small>
        <b>{fmt(pot)}</b>
      </span>
      <span>
        <small>Đang cược</small>
        <b>{fmt(bets)}</b>
      </span>
      <span>
        <small>Trong ván</small>
        <b>{inHand} người</b>
      </span>
    </div>
  );
}

/* ---------- chat ---------- */

export function ChatList({ messages, me, spectators, compact = false }: { messages: ChatMessage[]; me: string; spectators: Spectator[]; compact?: boolean }) {
  const list = useRef<HTMLDivElement>(null);
  const watching = new Set(spectators.map((s) => s.player_id));
  // Newest line in view: scroll the list itself (scrollIntoView would also scroll the page sideways
  // toward the closed phone drawer).
  useEffect(() => {
    const el = list.current?.closest(".side-body") ?? list.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages.length]);
  return (
    <div ref={list} className={`chat${compact ? " is-compact" : ""}`} role="log" aria-label="Chat của bàn" aria-live="polite">
      {messages.length === 0 && <div className="chat-day">Chưa có tin nhắn</div>}
      {messages.map((m) => {
        const mine = m.player_id === me;
        const watcher = watching.has(m.player_id);
        const onlyEmoji = /^\p{Extended_Pictographic}+$/u.test(m.text);
        return (
          <div key={m.message_id} className={`msg${mine ? " is-mine" : ""}${watcher ? " is-watcher" : ""}`}>
            {!mine && <Avatar name={m.display_name} size={compact ? 26 : 30} />}
            <div className="msg-body">
              {!mine && (
                <span className="msg-who">
                  {m.display_name}
                  {watcher && <em>đang xem</em>}
                  <time dateTime={m.sent_at}>{hhmm(m.sent_at)}</time>
                </span>
              )}
              <span className={`msg-text${onlyEmoji ? " is-emoji" : ""}`}>{m.text}</span>
              {mine && (
                <time className="msg-time" dateTime={m.sent_at}>
                  {hhmm(m.sent_at)} · đã gửi
                </time>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

export function ChatComposer({ onSend, disabled }: { onSend: (text: string) => void; disabled?: boolean }) {
  // Offline (disabled) the draft stays: it is sent once the socket is back.
  const [draft, setDraft] = useState("");
  const submit = (e?: FormEvent) => {
    e?.preventDefault();
    const text = draft.trim();
    if (!text) return;
    onSend(text);
    setDraft("");
  };
  return (
    <form className="composer" onSubmit={submit}>
      <div className="emoji-row" role="group" aria-label="Gửi nhanh">
        {QUICK_EMOJI.map((e) => (
          <button key={e} type="button" className="emoji" onClick={() => onSend(e)} disabled={disabled} aria-label={`Gửi ${e}`}>
            {e}
          </button>
        ))}
      </div>
      <div className="composer-row">
        <label className="composer-input">
          <Smile size={18} strokeWidth={1.8} aria-hidden />
          <input
            className="composer-field"
            value={draft}
            maxLength={CHAT_MAX}
            placeholder={disabled ? "Mất kết nối — chờ nối lại…" : "Nhắn cho cả bàn…"}
            aria-label="Tin nhắn"
            onChange={(e) => setDraft(e.target.value)}
            disabled={disabled}
            enterKeyHint="send"
          />
        </label>
        <button type="submit" className={`composer-send${draft.trim() ? " is-ready" : ""}`} aria-label="Gửi" disabled={disabled || !draft.trim()}>
          <Send size={17} strokeWidth={2} />
        </button>
      </div>
    </form>
  );
}

export function WatchersBlock({ spectators, device }: { spectators: Spectator[]; device: "desktop" | "mobile" }) {
  return (
    <div className={`watch-block watch-${device}`}>
      <span className="watch-head">
        Đang xem <i>{spectators.length}</i>
      </span>
      {spectators.length > 0 && (
        <span className="watch-list">
          {spectators.map((s) => (
            <span key={s.player_id} className="watch-person">
              <Avatar name={s.display_name} size={device === "desktop" ? 28 : 26} />
              <span>{s.display_name}</span>
            </span>
          ))}
        </span>
      )}
      <small className="watch-note">Người xem chat được nhưng không thấy bài úp.</small>
    </div>
  );
}

/** Spectators as a pill on the stage (desktop showdown) or in the phone column. */
export function Spectators({ spectators, device }: { spectators: Spectator[]; device: "desktop" | "mobile" }) {
  if (spectators.length === 0) return null;
  return (
    <div className={`watchers watchers-${device}`}>
      <span className="watchers-avs">
        {spectators.slice(0, 4).map((s) => (
          <Avatar key={s.player_id} name={s.display_name} size={device === "desktop" ? 26 : 22} />
        ))}
      </span>
      <span className="watchers-text">
        <b>{spectators.length} người đang xem</b>
        <small>{spectators.map((s) => s.display_name).join(", ")}</small>
      </span>
    </div>
  );
}

export function PlayerList({ seats }: { seats: SeatView[] }) {
  const taken = seats.filter((s) => s.state !== "empty");
  const STATE: Partial<Record<SeatView["state"], string>> = {
    turn: "đang suy nghĩ",
    folded: "đã bỏ",
    "all-in": "all-in",
    "sitting-out": "đang nghỉ",
    disconnected: "mất kết nối",
    winner: "thắng ván",
  };
  return (
    <ul className="plist">
      {taken.map((s) => (
        <li key={s.seat} className={`plist-row st-${s.state}`}>
          <Avatar name={s.name ?? "?"} size={30} />
          <span className="plist-id">
            <b>
              {s.name}
              {s.isMe && <em> · Bạn</em>}
            </b>
            <small>
              Ghế {s.seat}
              {STATE[s.state] ? ` · ${STATE[s.state]}` : ""}
            </small>
          </span>
          <span className="plist-stack">{fmt(s.stack ?? 0)}</span>
        </li>
      ))}
    </ul>
  );
}

/* ---------- phone chat drawer ---------- */

export function ChatDrawer({
  open,
  onClose,
  messages,
  me,
  spectators,
  onSend,
  offline,
}: {
  open: boolean;
  onClose: () => void;
  messages: ChatMessage[];
  me: string;
  spectators: Spectator[];
  onSend: (text: string) => void;
  offline?: boolean;
}) {
  const [tab, setTab] = useState<"chat" | "watch">("chat");
  const panel = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);
  // Focus moves into the drawer when it opens and back to the chat button when it closes.
  const wasOpen = useRef(false);
  useEffect(() => {
    if (open) panel.current?.focus();
    else if (wasOpen.current) document.getElementById("tbl-chat-btn")?.focus();
    wasOpen.current = open;
  }, [open]);
  return (
    <>
      <div className={`scrim scrim-soft drawer-scrim${open ? " is-open" : ""}`} onClick={onClose} aria-hidden />
      <div ref={panel} className={`drawer chat-drawer${open ? " is-open" : ""}`} role="dialog" aria-modal={false} aria-label="Chat và người xem" tabIndex={-1} inert={!open}>
        <div className="drawer-tabs" role="tablist">
          <button type="button" role="tab" aria-selected={tab === "chat"} className={tab === "chat" ? "is-active" : ""} onClick={() => setTab("chat")}>
            Chat <i>{messages.length}</i>
          </button>
          <button type="button" role="tab" aria-selected={tab === "watch"} className={tab === "watch" ? "is-active" : ""} onClick={() => setTab("watch")}>
            Người xem <i>{spectators.length}</i>
          </button>
          <IconButton label="Đóng" onClick={onClose}>
            <X size={18} />
          </IconButton>
        </div>
        {tab === "watch" ? (
          <WatchersBlock spectators={spectators} device="mobile" />
        ) : (
          <>
            {spectators.length > 0 && <WatchersBlock spectators={spectators} device="mobile" />}
            <ChatList compact messages={messages} me={me} spectators={spectators} />
            <ChatComposer onSend={onSend} disabled={offline} />
          </>
        )}
      </div>
    </>
  );
}
