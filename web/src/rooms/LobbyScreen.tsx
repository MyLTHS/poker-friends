"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState, type CSSProperties } from "react";
import { Eye, Link2, Lock, Plus, RotateCw, Search } from "lucide-react";

import { errorText } from "@/account/messages";
import { Button, ButtonLink, EmptyState, ErrorState, Loading, MiniTable, PageHead, Panel, SkeletonCard, Tabs, TextField } from "@/ui";

import { createRoomsApi, type LobbyRoom, type RoomsApi } from "./api";
import { useClientValue, useMe, usePhone, useReloadWhenOnline } from "./hooks";
import { filterCount, filterRooms, inviteToken, isMine, roomCta, type LobbyFilter } from "./lobby";
import { PasteInvite, RoomBadges } from "./RoomBits";
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

/** /rooms — the lobby (D1 "lobby"): rooms the viewer may see, search, filters, invite link. */
export function LobbyScreen() {
  const api = useMemo(() => createRoomsApi(), []);
  const { me } = useMe();
  const phone = usePhone();
  const [load, setLoad] = useState<Load>(null);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<LobbyFilter>("all");
  const [pasteOpen, setPasteOpen] = useState(false);
  // The server (and hydration) say "Sảnh"; the day part is the browser's clock.
  const eyebrow = useClientValue(() => `Sảnh · ${dayPart(new Date())}`, "Sảnh");

  const fetchRooms = useCallback((quiet: boolean) => api.lobby().then((result) => setLoad((prev) => next(prev, result, quiet))), [api]);
  useEffect(() => {
    void fetchRooms(false);
    const timer = window.setInterval(() => void fetchRooms(true), 20000);
    return () => window.clearInterval(timer);
  }, [fetchRooms]);
  const online = useReloadWhenOnline(useCallback(() => void fetchRooms(false), [fetchRooms]));

  const myName = me?.username ?? null;
  const rooms = load && "rooms" in load ? load.rooms : [];
  const shown = filterRooms(rooms, { query, filter, myName });
  const seatedTotal = rooms.reduce((a, r) => a + r.seated, 0);
  const counts = phone ? `${rooms.length} phòng · ${seatedTotal} người` : `${rooms.length} phòng · ${seatedTotal} người đang ngồi`;

  const counted = !phone && load !== null && "rooms" in load;
  const tabs = [
    { value: "all" as const, label: "Tất cả", count: counted ? rooms.length : undefined },
    { value: "public" as const, label: "Công khai", count: counted ? filterCount(rooms, "public", myName) : undefined },
    { value: "mine" as const, label: "Của tôi", count: counted ? filterCount(rooms, "mine", myName) : undefined },
    ...(phone ? [] : [{ value: "open" as const, label: "Còn ghế" }]),
  ];
  const tabsEl = <Tabs id="lobby-filter" label="Lọc phòng" items={tabs} value={filter} onChange={setFilter} fill={phone} />;
  const search = (
    <TextField
      className="search"
      aria-label="Tìm phòng"
      type="search"
      placeholder={phone ? "Tìm phòng hoặc chủ phòng…" : "Tìm theo tên phòng hoặc chủ phòng…"}
      icon={<Search size={17} strokeWidth={1.9} aria-hidden />}
      value={query}
      onChange={(e) => setQuery(e.target.value)}
    />
  );

  const body =
    load === null ? (
      <Loading label="Đang tải danh sách phòng…" className={phone ? "room-list" : "room-grid"}>
        {[0, 1, 2, 3].map((i) => (
          <SkeletonCard key={i} compact={phone} />
        ))}
      </Loading>
    ) : "error" in load ? (
      <Panel phone={phone} className="state-panel is-center">
        <ErrorState
          title="Không tải được danh sách phòng"
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
          title="Sảnh còn trống"
          text="Chưa có phòng nào. Mở bàn đầu tiên rồi gửi link cho hội bạn."
          actions={
            <>
              <ButtonLink kind="primary" size={phone ? "sm" : "md"} href="/rooms/new" icon={<Plus size={15} strokeWidth={2.4} aria-hidden />}>
                Tạo phòng
              </ButtonLink>
              <Button kind="ghost" size={phone ? "sm" : "md"} icon={<Link2 size={15} aria-hidden />} onClick={() => (phone ? setPasteOpen(true) : document.getElementById("paste-invite")?.focus())}>
                {phone ? "Dán link" : "Dán link mời"}
              </Button>
            </>
          }
        />
      </Panel>
    ) : shown.length === 0 ? (
      <Panel phone={phone} className="state-panel is-center">
        <EmptyState
          title="Không có phòng nào khớp"
          text={query ? `Không thấy phòng hay chủ phòng nào tên "${query}".` : "Thử bộ lọc khác."}
          actions={
            <Button kind="ghost" size="sm" onClick={() => (setQuery(""), setFilter("all"))}>
              Xoá tìm và lọc
            </Button>
          }
        />
      </Panel>
    ) : phone ? (
      <div className="room-list" role="list" aria-label="Các phòng">
        {shown.map((r, i) => (
          <RoomRow key={r.room.room_id} r={r} myName={myName} index={i} />
        ))}
      </div>
    ) : (
      <div className="room-grid" role="list" aria-label="Các phòng">
        {shown.map((r, i) => (
          <RoomCard key={r.room.room_id} r={r} myName={myName} index={i} />
        ))}
      </div>
    );

  if (phone) {
    return (
      <RoomsShell active="lobby" me={me} className="m-lobby">
        <section className="m-col">
          <div className="m-title">
            <h1>Chọn một bàn</h1>
            {load && "rooms" in load && <small>{counts}</small>}
          </div>
          {body}
        </section>
        <aside className="m-col m-lobby-side">
          <span className="eyebrow" suppressHydrationWarning>
            {eyebrow}
          </span>
          {search}
          {tabsEl}
          <PhonePaste open={pasteOpen} onOpen={() => setPasteOpen(true)} />
          <p className="m-note">
            <Lock size={12} aria-hidden /> Phòng riêng chỉ hiện với chủ phòng và người có link mời.
          </p>
          <ButtonLink kind="primary" size="lg" block href="/rooms/new" icon={<Plus size={18} strokeWidth={2.4} aria-hidden />}>
            Tạo phòng
          </ButtonLink>
        </aside>
      </RoomsShell>
    );
  }
  return (
    <RoomsShell active="lobby" me={me}>
      <PageHead
        eyebrow={<span suppressHydrationWarning>{eyebrow}</span>}
        title="Chọn một bàn"
        sub={load && "rooms" in load ? counts : "Bàn của hội bạn, chip ảo."}
        actions={
          <ButtonLink kind="primary" size="lg" href="/rooms/new" icon={<Plus size={18} strokeWidth={2.4} aria-hidden />}>
            Tạo phòng
          </ButtonLink>
        }
      />
      <div className="toolbar">
        {search}
        {tabsEl}
        <PasteInvite inputId="paste-invite" />
      </div>
      <div id={`lobby-filter-panel-${filter}`} role="tabpanel" aria-labelledby={`lobby-filter-tab-${filter}`}>
        {body}
      </div>
      <p className="page-foot">
        <Lock size={13} aria-hidden /> Phòng riêng chỉ hiện với chủ phòng và người có link mời.
      </p>
      <MockServerLinks />
    </RoomsShell>
  );
}

const enter = (index: number) => ({ "--i": Math.min(index, 8) }) as CSSProperties;

function RoomCard({ r, myName, index }: { r: LobbyRoom; myName: string | null; index: number }) {
  const router = useRouter();
  const cta = roomCta(r, myName);
  const mine = isMine(r, myName);
  const href = `/rooms/${r.room.room_id}`;
  // The whole card opens the room for a mouse; keyboards and screen readers use its button.
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
    <Link href={`/rooms/${r.room.room_id}`} className={`room-row${mine ? " is-mine" : ""}`} role="listitem" style={enter(index)} aria-label={`${r.room.name}: ${cta.label}`}>
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

/** The phone's dashed "Có link mời?" row: reads the clipboard when allowed, else opens a box. */
function PhonePaste({ open, onOpen }: { open: boolean; onOpen: () => void }) {
  const router = useRouter();
  if (open) return <PasteInvite inputId="paste-invite" compact autoFocus />;
  return (
    <div className="paste-row">
      <Link2 size={17} strokeWidth={1.9} aria-hidden />
      <span>
        <b>Có link mời?</b> Dán để vào thẳng bàn
      </span>
      <button
        type="button"
        className="paste-btn"
        onClick={async () => {
          const text = await navigator.clipboard?.readText().catch(() => "");
          const token = text ? inviteToken(text) : null;
          if (token) router.push(`/rooms/join?token=${encodeURIComponent(token)}`);
          else onOpen();
        }}
      >
        Dán
      </button>
    </div>
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
