"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState, type CSSProperties } from "react";
import { Eye, Lock, Plus, RotateCw } from "lucide-react";

import { errorText } from "@/account/messages";
import { Button, ButtonLink, EmptyState, ErrorState, Loading, MiniTable, PageHead, Panel, SkeletonCard } from "@/ui";

import { createRoomsApi, type LobbyRoom, type RoomsApi } from "./api";
import { needsName, useClientValue, useMe, usePhone, useReloadWhenOnline } from "./hooks";
import { isMine, roomCta } from "./lobby";
import { NameGate } from "./NameGate";
import { RoomBadges } from "./RoomBits";
import { RoomsShell } from "./RoomsShell";
import { blindsText } from "./rules";

type Load = { rooms: LobbyRoom[] } | { error: string; tries: number; at: string } | null;

/** The next state after a lobby call. A failed background refresh keeps the list it has. */
function next(prev: Load, result: Awaited<ReturnType<RoomsApi["lobby"]>>, quiet: boolean): Load {
  if (result.ok) return { rooms: result.data.rooms };
  if (quiet && prev && "rooms" in prev) return prev;
  const text = result.error.code === "network_error" ? "Mạng đang chập chờn. Bàn và chip của bạn vẫn an toàn." : errorText(result.error);
  return { error: text, tries: (prev && "tries" in prev ? prev.tries : 0) + 1, at: nowClock() };
}

const WEEKDAYS = ["Chủ nhật", "thứ Hai", "thứ Ba", "thứ Tư", "thứ Năm", "thứ Sáu", "thứ Bảy"];

/** "tối thứ Sáu": the lobby's eyebrow, like the design's. */
function dayPart(now: Date) {
  const h = now.getHours();
  const part = h < 11 ? "sáng" : h < 14 ? "trưa" : h < 18 ? "chiều" : h < 23 ? "tối" : "khuya";
  return `${part} ${WEEKDAYS[now.getDay()]}`;
}

const nowClock = () => new Date().toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit", hour12: false });

/** A room's page is its table (/rooms/<id> comes here too). */
const tableHref = (r: LobbyRoom) => `/rooms/${r.room.room_id}/table`;

/**
 * /rooms — the lobby (D1 "lobby"), as plain as Poker Now: one "Tạo bàn" button and the rooms the
 * viewer may see, each opening its table. A visitor nobody knows yet says their name first
 * (NameGate): asking for the list would make them a guest with a random name.
 */
export function LobbyScreen() {
  const api = useMemo(() => createRoomsApi(), []);
  const { me, guestsAllowed, signedIn } = useMe();
  const phone = usePhone();
  const [load, setLoad] = useState<Load>(null);
  // The server (and hydration) say "Sảnh"; the day part is the browser's clock.
  const eyebrow = useClientValue(() => `Sảnh · ${dayPart(new Date())}`, "Sảnh");
  const known = me !== undefined && !needsName(me, guestsAllowed);

  const fetchRooms = useCallback((quiet: boolean) => api.lobby().then((result) => setLoad((prev) => next(prev, result, quiet))), [api]);
  useEffect(() => {
    if (!known) return;
    void fetchRooms(false);
    const timer = window.setInterval(() => void fetchRooms(true), 20000);
    return () => window.clearInterval(timer);
  }, [fetchRooms, known]);
  const online = useReloadWhenOnline(
    useCallback(() => {
      if (known) void fetchRooms(false);
    }, [fetchRooms, known]),
  );

  if (needsName(me, guestsAllowed)) {
    return (
      <RoomsShell active="lobby" me={me}>
        <NameGate onDone={signedIn} />
      </RoomsShell>
    );
  }

  const myName = me?.username ?? null;
  const rooms = load && "rooms" in load ? load.rooms : [];
  const seatedTotal = rooms.reduce((a, r) => a + r.seated, 0);
  const counts = phone ? `${rooms.length} bàn · ${seatedTotal} người` : `${rooms.length} bàn · ${seatedTotal} người đang ngồi`;
  const create = (
    <ButtonLink kind="primary" size="lg" href="/rooms/new" icon={<Plus size={18} strokeWidth={2.4} aria-hidden />}>
      Tạo bàn
    </ButtonLink>
  );

  const body =
    load === null ? (
      <Loading label="Đang tải danh sách bàn…" className={phone ? "room-list" : "room-grid"}>
        {[0, 1, 2, 3].map((i) => (
          <SkeletonCard key={i} compact={phone} />
        ))}
      </Loading>
    ) : "error" in load ? (
      <Panel phone={phone} className="state-panel is-center">
        <ErrorState
          title="Không tải được danh sách bàn"
          text={online ? load.error : "Máy đang mất mạng. Có mạng lại là sảnh tự tải lại."}
          actions={
            <Button kind="primary" size={phone ? "sm" : "md"} icon={<RotateCw size={15} strokeWidth={2.2} aria-hidden />} onClick={() => (setLoad(null), void fetchRooms(false))}>
              Thử lại
            </Button>
          }
          meta={phone ? undefined : `Đã thử ${load.tries} lần · lần cuối ${load.at}`}
        />
      </Panel>
    ) : rooms.length === 0 ? (
      <Panel phone={phone} className="state-panel is-center">
        <EmptyState
          art={<MiniTable seats={6} seated={0} w={phone ? 96 : 180} h={phone ? 58 : 104} />}
          badge={<Plus size={phone ? 15 : 18} strokeWidth={2.4} />}
          title="Chưa có bàn nào — bấm Tạo bàn rồi gửi link cho bạn bè."
        />
      </Panel>
    ) : phone ? (
      <div className="room-list" role="list" aria-label="Các bàn">
        {rooms.map((r, i) => (
          <RoomRow key={r.room.room_id} r={r} myName={myName} index={i} />
        ))}
      </div>
    ) : (
      <div className="room-grid" role="list" aria-label="Các bàn">
        {rooms.map((r, i) => (
          <RoomCard key={r.room.room_id} r={r} myName={myName} index={i} />
        ))}
      </div>
    );

  if (phone) {
    return (
      <RoomsShell active="lobby" me={me} className="m-lobby">
        <div className="m-head">
          <div className="m-title">
            <h1>Chọn một bàn</h1>
            {load && "rooms" in load && <small>{counts}</small>}
          </div>
          {create}
        </div>
        {body}
      </RoomsShell>
    );
  }
  return (
    <RoomsShell active="lobby" me={me}>
      <PageHead
        eyebrow={<span suppressHydrationWarning>{eyebrow}</span>}
        title="Chọn một bàn"
        sub={load && "rooms" in load ? counts : "Bàn của hội bạn, chip ảo."}
        actions={create}
      />
      {body}
      <MockServerLinks />
    </RoomsShell>
  );
}

const enter = (index: number) => ({ "--i": Math.min(index, 8) }) as CSSProperties;

function RoomCard({ r, myName, index }: { r: LobbyRoom; myName: string | null; index: number }) {
  const router = useRouter();
  const cta = roomCta(r, myName);
  const mine = isMine(r, myName);
  const href = tableHref(r);
  // The whole card opens the table for a mouse; keyboards and screen readers use its button.
  return (
    <article
      className={`room-card${mine ? " is-mine" : ""}`}
      role="listitem"
      style={enter(index)}
      aria-label={r.room.name}
      onClick={(e) => {
        if (!(e.target as HTMLElement).closest("a")) router.push(href);
      }}
    >
      {mine && <span className="room-ribbon">Bàn của bạn</span>}
      <MiniTable seats={r.room.max_seats} seated={r.seated} w={168} h={100} dealer={r.room.status === "playing"} />
      <div className="rc-body">
        <h3>{r.room.name}</h3>
        <RoomBadges room={r.room} isPrivate={r.is_private} />
        <dl className="rc-meta">
          <div>
            <dt>Blind</dt>
            <dd>{blindsText(r.room)}</dd>
          </div>
          <div>
            <dt>Ghế</dt>
            <dd>
              {r.seated}/{r.room.max_seats}
            </dd>
          </div>
          <div>
            <dt>Chủ phòng</dt>
            <dd>{r.owner_name ?? "—"}</dd>
          </div>
        </dl>
        <div className="rc-foot">
          <small>{cta.note}</small>
          <ButtonLink
            kind={cta.kind}
            size="sm"
            href={href}
            icon={cta.watch ? <Eye size={15} aria-hidden /> : undefined}
            className="rc-cta"
            aria-label={`${cta.label}: ${r.room.name}`}
          >
            {cta.label}
          </ButtonLink>
        </div>
      </div>
    </article>
  );
}

function RoomRow({ r, myName, index }: { r: LobbyRoom; myName: string | null; index: number }) {
  const cta = roomCta(r, myName);
  const mine = isMine(r, myName);
  return (
    <Link href={tableHref(r)} className={`room-row${mine ? " is-mine" : ""}`} role="listitem" style={enter(index)} aria-label={`${r.room.name}: ${cta.label}`}>
      <MiniTable seats={r.room.max_seats} seated={r.seated} w={70} h={44} />
      <span className="rr-body">
        <span className="rr-top">
          <b>{r.room.name}</b>
          {r.is_private && <Lock size={12} strokeWidth={2.4} className="rr-lock" aria-label="Riêng" />}
        </span>
        <span className="rr-meta">
          {blindsText(r.room)} · {r.seated}/{r.room.max_seats} ghế · {mine ? "của bạn" : `chủ ${r.owner_name ?? "?"}`}
        </span>
        <span className="rr-badges">
          <span className={`rr-status${r.room.status === "playing" ? " is-live" : r.room.status === "closed" || r.room.status === "suspended" ? " is-off" : ""}`}>
            {r.room.status === "playing" ? "Đang chơi" : r.room.status === "open" ? "Đang mở" : r.room.status === "closed" ? "Đã đóng" : "Tạm dừng"}
          </span>
          {r.room.seven_deuce_bonus > 0 && <span className="rr-seven">7-2 · {r.room.seven_deuce_bonus}</span>}
        </span>
      </span>
      <span className={`rr-cta is-${cta.kind}`} aria-hidden>
        {cta.short}
      </span>
    </Link>
  );
}

// Players of the mock server's scenario (docs/api/fixtures/scenarios/three-friends.json): the
// old home page's shortcuts, kept for development only.
const MOCK_PLAYERS = [
  { id: "1", name: "Lym" },
  { id: "2", name: "An" },
  { id: "3", name: "Bình" },
];

function MockServerLinks() {
  if (process.env.NODE_ENV === "production") return null;
  return (
    <nav className="mock-links" aria-label="Mock server (chỉ khi dev)">
      <span>Mock server:</span>
      {MOCK_PLAYERS.map((p) => (
        <Link key={p.id} href={`/table?player=${p.id}`} className="link is-muted">
          {p.name}
        </Link>
      ))}
      <Link href="/table" className="link is-muted">
        Chỉ xem
      </Link>
    </nav>
  );
}
