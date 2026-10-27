// Kẹo Đêm (d3) — page chrome shared by non-table screens: desktop nav, auth art panel, room ticket.
import type { ReactNode } from "react";
import { Bell, ChevronRight, Crown, Eye, Globe, History, House, Lock, User } from "lucide-react";

import { ROOMS } from "../../shared/data";
import { Avatar, Btn, IconBtn, Logo, PCard, Sticker, Token, type Tone } from "./ui";

export function AppNav({ active }: { active: 0 | 1 | 2 | -1 }) {
  const items = [
    { icon: <House size={18} strokeWidth={2.8} />, label: "Sảnh" },
    { icon: <History size={18} strokeWidth={2.8} />, label: "Lịch sử" },
    { icon: <User size={18} strokeWidth={2.8} />, label: "Hồ sơ" },
  ];
  return (
    <header className="anav">
      <Logo size={24} />
      <nav className="anav-tabs">
        {items.map((it, i) => (
          <span key={it.label} className={i === active ? "on" : ""}>
            {it.icon}
            {it.label}
          </span>
        ))}
      </nav>
      <span className="anav-r">
        <IconBtn size={44} badge={1}>
          <Bell size={19} strokeWidth={2.8} />
        </IconBtn>
        <span className="anav-me">
          <Avatar name="Lym" size={38} />
          <b>Lym</b>
        </span>
      </span>
    </header>
  );
}

/** Party illustration: a little stadium table with friends, cards and stickers. Pure CSS. */
export function PartyArt({ compact }: { compact?: boolean }) {
  const friends = ["An", "Bình", "Chi", "Khoa", "Giang", "Lym"];
  return (
    <div className={`art ${compact ? "art-compact" : ""}`} aria-hidden>
      <div className="art-felt">
        <div className="art-cards">
          <PCard c={{ rank: "A", suit: "♠" }} size={compact ? "md" : "lg"} tilt={-12} />
          <PCard c={{ rank: "K", suit: "♥" }} size={compact ? "md" : "lg"} tilt={4} />
          <PCard c="back" size={compact ? "md" : "lg"} tilt={16} />
        </div>
        <span className="art-chips">
          <Token tone="pink" size={compact ? 18 : 24} />
          <Token tone="sky" size={compact ? 18 : 24} />
          <Token tone="sun" size={compact ? 18 : 24} />
        </span>
      </div>
      {friends.map((n, i) => (
        <span key={n} className={`art-av art-av-${i + 1}`}>
          <Avatar name={n} size={compact ? 40 : 58} />
        </span>
      ))}
      <Sticker tone="pink" tilt={-10} className="art-stk art-stk-1">
        ALL-IN!
      </Sticker>
      <Sticker tone="sun" tilt={8} className="art-stk art-stk-2">
        7-2 😎
      </Sticker>
      <Sticker tone="lime" tilt={-6} className="art-stk art-stk-3">
        GG 🔥
      </Sticker>
      <span className="art-emo art-emo-1">😂</span>
      <span className="art-emo art-emo-2">🎉</span>
    </div>
  );
}

export function AuthArt() {
  return (
    <section className="authart">
      <Logo size={26} />
      <div className="authart-copy">
        <h1>
          Poker với
          <br />
          <em>hội bạn thân</em>
        </h1>
        <p>Chip ảo, không tiền thật. Gửi một cái link là cả hội vào chung bàn, trên máy tính hay điện thoại.</p>
      </div>
      <PartyArt />
      <div className="authart-feats">
        <Sticker tone="white" tilt={-2}>
          🪙 Chip ảo 100%
        </Sticker>
        <Sticker tone="white" tilt={2}>
          🔗 Rủ nhau bằng link
        </Sticker>
        <Sticker tone="white" tilt={-1}>
          📱 Chơi bằng ngón cái
        </Sticker>
      </div>
    </section>
  );
}

const ACCENT: Tone[] = ["pink", "sky", "sun", "lime"];
type Room = (typeof ROOMS)[number];

export function SeatDots({ seated, seats }: { seated: number; seats: number }) {
  return (
    <span className="seatdots">
      {Array.from({ length: seats }, (_, i) => (
        <i key={i} className={i < seated ? "on" : ""} />
      ))}
    </span>
  );
}

/** A room as a ticket: coloured stub with the blind, perforation, details on the right. */
export function Ticket({ room, i, mobile }: { room: Room; i: number; mobile?: boolean }) {
  const tone = ACCENT[i % ACCENT.length];
  const full = room.seated >= room.seats;
  const empty = room.seated === 0;
  const mine = room.owner === "Lym";
  return (
    <article className={`ticket ticket-${tone} ${mobile ? "ticket-m" : ""}`}>
      <div className="ticket-stub">
        <small>Blind</small>
        <b className="num">{room.blinds}</b>
        {room.bonus > 0 ? <span className="ticket-72">7-2 · {room.bonus}</span> : <span className="ticket-72 off">7-2 tắt</span>}
      </div>
      <div className="ticket-main">
        <div className="ticket-top">
          <b className="ticket-name">{room.name}</b>
          {mine && (
            <Sticker tone="sun" tilt={-4} className="ticket-mine">
              <Crown size={12} strokeWidth={3} /> Của bạn
            </Sticker>
          )}
        </div>
        <div className="ticket-meta">
          <span className="ticket-kind">
            {room.private ? <Lock size={13} strokeWidth={3} /> : <Globe size={13} strokeWidth={3} />}
            {room.private ? "Riêng" : "Công khai"}
          </span>
          {mobile ? (
            <span className={`status ${room.status === "Đang chơi" ? "status-live" : "status-open"}`}>
              <i />
              {room.status}
            </span>
          ) : (
            <span className="ticket-owner">
              <Avatar name={room.owner} size={20} /> chủ phòng {room.owner}
            </span>
          )}
        </div>
        <div className="ticket-seats">
          <SeatDots seated={room.seated} seats={room.seats} />
          <b className="num">
            {room.seated}/{room.seats}
          </b>
          <span>ghế</span>
        </div>
        <div className="ticket-foot">
          {!mobile && (
            <span className={`status ${room.status === "Đang chơi" ? "status-live" : "status-open"}`}>
              <i />
              {room.status}
            </span>
          )}
          {mobile ? (
            <span className={`ticket-go ${full ? "ticket-go-ghost" : ""}`}>
              {full ? <Eye size={18} strokeWidth={3} /> : <ChevronRight size={20} strokeWidth={3.4} />}
            </span>
          ) : full ? (
            <Btn tone="ghost" size="md" icon={<Eye size={17} strokeWidth={3} />}>
              Đầy · vào xem
            </Btn>
          ) : empty ? (
            <Btn tone="lime" size="md">
              Ngồi đầu tiên
            </Btn>
          ) : (
            <Btn tone={tone === "lime" ? "lime" : "pink"} size="md">
              Vào bàn
            </Btn>
          )}
        </div>
      </div>
    </article>
  );
}

export const Divider = ({ children }: { children: ReactNode }) => (
  <span className="divider">
    <i />
    {children}
    <i />
  </span>
);
