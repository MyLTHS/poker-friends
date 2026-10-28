"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, Crown, DoorOpen, History, MessageCircle, RotateCw, Send, Users } from "lucide-react";

import type { Result } from "@/account/api";
import { errorText } from "@/account/messages";
import { Avatar, Button, ButtonLink, ErrorState, IconButton, Loading, PageHead, Panel, Skeleton, SkeletonCard } from "@/ui";
import { fmt } from "@/ui/format";

import { createRoomsApi, type RoomDetail, type RoomsApi, type TableSnapshot } from "./api";
import { useMe, usePhone, useReloadWhenOnline } from "./hooks";
import { OwnerSheet } from "./OwnerPanel";
import { Invitation, invitationMeta, InviteFrom, RoomBadges, ShareCard } from "./RoomBits";
import { RoomsShell, useShellToast } from "./RoomsShell";
import { blindsText, rulesLine } from "./rules";
import { useRoomLive } from "./useRoomLive";

type Loaded = { detail: RoomDetail; table: TableSnapshot["table"] };
type State = Loaded | { error: { code: string; text: string } } | null;

async function loadRoom(rooms: RoomsApi, id: number): Promise<State> {
  const detail = await rooms.get(id);
  if (!detail.ok) return { error: { code: detail.error.code, text: errorText(detail.error) } };
  const snapshot = await rooms.snapshot(id);
  if (!snapshot.ok) return { error: { code: snapshot.error.code, text: errorText(snapshot.error) } };
  return { detail: detail.data, table: snapshot.data.table };
}

/**
 * /rooms/<id> — the room before the table: what it is, who sits where, the owner's invite link and
 * panel, chat. The WebSocket brings chat and says when the table changed; the room itself is
 * reloaded over REST, and a slow REST poll covers a dropped socket.
 */
export function RoomScreen({ roomId, fresh = false }: { roomId: number; fresh?: boolean }) {
  const rooms = useMemo(() => createRoomsApi(), []);
  const router = useRouter();
  const { me, whenReady } = useMe();
  const phone = usePhone();
  const [toast, toastRef] = useShellToast();
  const [state, setState] = useState<State>(null);
  const [ownerOpen, setOwnerOpen] = useState(false);
  const [busySeat, setBusySeat] = useState<number | null>(null);

  const refresh = useCallback(() => loadRoom(rooms, roomId).then(setState), [rooms, roomId]);
  const loaded = state !== null && !("error" in state);
  const { live, say } = useRoomLive(rooms, roomId, loaded);

  useEffect(() => {
    if (live.tableChanges > 0) void refresh();
  }, [live.tableChanges, refresh]);

  useEffect(() => {
    let cancelled = false;
    const tick = () =>
      loadRoom(rooms, roomId).then((next) => {
        // a failed background poll keeps the room on screen; the next one may work
        if (!cancelled) setState((prev) => (next && "error" in next && next.error.code === "network_error" && prev && !("error" in prev) ? prev : next));
      });
    whenReady().then(tick);
    const timer = window.setInterval(tick, 10000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [rooms, roomId, whenReady]);
  useReloadWhenOnline(useCallback(() => void refresh(), [refresh]));

  // Just created: say where the link is (once; the ?moi=1 goes away).
  const greeted = useRef(false);
  useEffect(() => {
    if (!fresh || !loaded || greeted.current) return;
    greeted.current = true;
    toast({ kind: "success", title: "Đã mở bàn", text: "Gửi link mời (hoặc cho quét QR) để hội bạn vào." });
    router.replace(`/rooms/${roomId}`, { scroll: false });
  }, [fresh, loaded, roomId, router, toast]);

  // Kicked while on the page: the socket says so first (4403); the REST reload then fails too.
  const kickedSaid = useRef(false);
  useEffect(() => {
    if (live.closedBy !== "kicked" || kickedSaid.current) return;
    kickedSaid.current = true;
    const name = state && "detail" in state ? state.detail.room.name : "phòng";
    toast({ kind: "danger", icon: <DoorOpen size={20} strokeWidth={1.9} />, title: "Bạn đã bị mời ra khỏi phòng", text: `Chủ phòng ${name} đã mời bạn ra. Chip của bạn vẫn ghi trong lịch sử.`, duration: 0 });
    void refresh();
  }, [live.closedBy, refresh, state, toast]);

  const sub = {
    title: state && "detail" in state ? state.detail.room.name : "Phòng",
    sub: state && "detail" in state ? `${blindsText(state.detail.room)} · ${state.table.seats.length}/${state.detail.room.max_seats} ghế` : undefined,
    back: "/rooms",
    right:
      state && "detail" in state ? (
        <>
          {state.detail.is_owner && (
            <IconButton label="Bảng chủ phòng" active={ownerOpen} onClick={() => setOwnerOpen(true)}>
              <Crown size={19} aria-hidden />
            </IconButton>
          )}
          {state.detail.room.status !== "closed" && (
            <ButtonLink kind="primary" size="sm" href={`/rooms/${roomId}/table`}>
              Vào bàn
            </ButtonLink>
          )}
        </>
      ) : undefined,
  };

  if (state === null || "error" in state) {
    return (
      <RoomsShell active="lobby" me={me} toastRef={toastRef} sub={phone ? sub : undefined}>
        {state === null ? (
          <Loading label="Đang mở phòng…" className="room-loading">
            {!phone && <Skeleton className="sk-title" />}
            <div className="invite-grid">
              <div className="invite-col">
                <SkeletonCard />
                <SkeletonCard />
              </div>
              <div className="invite-col">
                <Skeleton className="sk-stage" />
              </div>
            </div>
          </Loading>
        ) : (
          <Panel phone={phone} className="state-panel is-center">
            <ErrorState
              icon={state.error.code === "kicked" ? <DoorOpen size={26} strokeWidth={1.9} /> : undefined}
              title={state.error.code === "kicked" ? "Bạn đã bị mời ra khỏi phòng" : state.error.code === "network_error" ? "Không tải được phòng" : "Không mở được phòng này"}
              text={state.error.code === "network_error" ? "Mạng đang chập chờn. Bàn và chip của bạn vẫn an toàn." : state.error.text}
              actions={
                <>
                  {state.error.code === "network_error" && (
                    <Button kind="primary" size={phone ? "sm" : "md"} icon={<RotateCw size={15} strokeWidth={2.2} aria-hidden />} onClick={() => (setState(null), void refresh())}>
                      Thử lại
                    </Button>
                  )}
                  <ButtonLink kind="ghost" size={phone ? "sm" : "md"} href="/rooms" icon={<ArrowLeft size={15} aria-hidden />}>
                    Về sảnh
                  </ButtonLink>
                </>
              }
            />
          </Panel>
        )}
      </RoomsShell>
    );
  }

  const { detail, table } = state;
  const room = detail.room;
  const mySeat = table.you.seat;
  const closed = room.status === "closed";
  const act = async (seat: number, action: () => Promise<Result<unknown>>, done: string) => {
    setBusySeat(seat);
    const result = await action();
    setBusySeat(null);
    toast(result.ok ? { kind: "success", title: done } : { kind: "danger", title: "Chưa làm được", text: errorText(result.error, result.retryAfter) });
    await refresh();
  };

  const watching = live.spectators.length;
  const liveLine =
    room.status === "playing" ? (
      <>
        <i className="dot is-live" aria-hidden /> Đang chơi{watching ? ` · ${watching} người xem` : ""}
      </>
    ) : room.status === "open" ? (
      <>
        <i className="dot" aria-hidden /> Đang mở · chờ đủ người{watching ? ` · ${watching} người xem` : ""}
      </>
    ) : room.status === "suspended" ? (
      "Bàn tạm dừng do lỗi server"
    ) : detail.closing ? (
      "Sẽ đóng khi ván này xong"
    ) : (
      "Phòng đã đóng"
    );

  const invitation = (
    <Invitation
      from={detail.owner_name ? <InviteFrom name={detail.owner_name} /> : undefined}
      title={room.name}
      meta={invitationMeta(room, table.seats.length)}
      live={liveLine}
      actions={
        closed ? (
          <ButtonLink kind="felt" size="lg" href={`/rooms/${roomId}/history`} icon={<History size={17} aria-hidden />}>
            Xem lời/lỗ
          </ButtonLink>
        ) : (
          <>
            <ButtonLink kind="felt" size="lg" href={`/rooms/${roomId}/table`} icon={<Users size={17} aria-hidden />}>
              {mySeat ? "Về bàn" : "Vào bàn chơi"}
            </ButtonLink>
            <ButtonLink kind="paper" size="lg" href={`/rooms/${roomId}/history`} icon={<History size={17} aria-hidden />}>
              Lịch sử
            </ButtonLink>
          </>
        )
      }
      who={
        me ? (
          <>
            Bạn đang đăng nhập là <b>{me.username}</b>
            {me.is_guest && " (khách)"} · <Link href="/account">đổi tài khoản</Link>
          </>
        ) : undefined
      }
    />
  );

  const seatsPanel = (
    <Panel title="Ghế" aside={`${table.seats.length}/${room.max_seats} có người`} phone={phone} className="seats-panel">
      <ul className="seat-list">
        {Array.from({ length: room.max_seats }, (_, i) => i + 1).map((n) => {
          const occupant = table.seats.find((s) => s.seat === n);
          const mine = occupant !== undefined && occupant.seat === mySeat;
          return (
            <li key={n} className={`${occupant ? "" : "is-empty"}${mine ? " is-me" : ""}`}>
              <span className="sl-no">{n}</span>
              {occupant ? (
                <>
                  <Avatar name={occupant.display_name} size={28} />
                  <span className="sl-id">
                    <b>
                      {occupant.display_name}
                      {mine && <em>bạn</em>}
                      {occupant.player_id === detail.owner_id && <Crown size={12} className="sl-crown" aria-label="chủ phòng" />}
                    </b>
                    <small>
                      {fmt(occupant.stack)} chip
                      {occupant.sitting_out && " · nghỉ"}
                      {!occupant.connected && " · mất kết nối"}
                    </small>
                  </span>
                  {mine && !closed && (
                    <Button kind="quiet" size="sm" busy={busySeat === n} onClick={() => act(n, () => rooms.leaveSeat(roomId), "Đã rời ghế")}>
                      Rời ghế
                    </Button>
                  )}
                </>
              ) : (
                <>
                  <span className="sl-id">
                    <small>Ghế trống</small>
                  </span>
                  {mySeat === null && !closed && (
                    <Button kind="ghost" size="sm" busy={busySeat === n} onClick={() => act(n, () => rooms.takeSeat(roomId, n), `Đã ngồi ghế ${n}`)}>
                      Ngồi đây
                    </Button>
                  )}
                </>
              )}
            </li>
          );
        })}
      </ul>
      {table.seats.length === 0 && !closed && <p className="seat-hint">Chưa ai ngồi. Chọn một ghế, chủ phòng sẽ cấp chip.</p>}
    </Panel>
  );

  const chat = <ChatPanel live={live} say={say} phone={phone} disabled={closed || live.closedBy !== null} />;

  return (
    <RoomsShell active="lobby" me={me} toastRef={toastRef} sub={phone ? sub : undefined} className="room-page">
      {!phone && (
        <PageHead
          eyebrow={`Phòng · chủ ${detail.owner_name ?? "?"}`}
          title={room.name}
          sub={
            <span className="room-sub">
              <RoomBadges room={room} isPrivate={detail.is_private} />
              <span>{rulesLine({ ...room, is_private: detail.is_private })}</span>
            </span>
          }
          actions={
            <>
              {detail.is_owner && (
                <Button kind="ghost" icon={<Crown size={16} aria-hidden />} onClick={() => setOwnerOpen(true)} aria-haspopup="dialog">
                  Bảng chủ phòng
                </Button>
              )}
              {!closed && (
                <ButtonLink kind="primary" href={`/rooms/${roomId}/table`} icon={<Users size={16} aria-hidden />}>
                  {mySeat ? "Về bàn" : "Vào bàn chơi"}
                </ButtonLink>
              )}
            </>
          }
        />
      )}
      <div className="invite-grid">
        <div className="invite-col">
          {detail.is_owner && !closed && (
            <ShareCard detail={detail} onCopied={(ok) => toast(ok ? { kind: "success", title: "Đã chép link mời" } : { kind: "danger", title: "Không chép được", text: "Trình duyệt chặn bộ nhớ tạm. Bấm giữ vào link để chép." })} />
          )}
          {seatsPanel}
          {!phone && chat}
        </div>
        <div className="invite-col">
          {detail.is_owner && !phone && <span className="step-label">Người nhận link mời sẽ thấy</span>}
          <div className="invite-stage">{invitation}</div>
          {phone && chat}
        </div>
      </div>
      {detail.is_owner && <OwnerSheet open={ownerOpen} onClose={() => setOwnerOpen(false)} detail={detail} seats={table.seats} onChanged={() => void refresh()} rooms={rooms} />}
    </RoomsShell>
  );
}

function ChatPanel({
  live,
  say,
  phone,
  disabled,
}: {
  live: ReturnType<typeof useRoomLive>["live"];
  say: (text: string) => void;
  phone: boolean;
  disabled: boolean;
}) {
  const [text, setText] = useState("");
  const list = useRef<HTMLOListElement>(null);
  useEffect(() => {
    list.current?.scrollTo({ top: list.current.scrollHeight });
  }, [live.chat.length]);
  const watching = live.spectators.map((s) => s.display_name);
  return (
    <Panel title="Chat" aside={watching.length ? `Đang xem: ${watching.join(", ")}` : "Chưa ai đứng xem"} phone={phone} className="room-chat">
      <ol ref={list} className="rc-lines" aria-live="polite" aria-label="Tin nhắn">
        {live.chat.map((line) => (
          <li key={line.message_id}>
            <Avatar name={line.display_name} size={22} />
            <span>
              <b>{line.display_name}</b> {line.text}
            </span>
          </li>
        ))}
        {live.chat.length === 0 && (
          <li className="rc-empty">
            <MessageCircle size={14} aria-hidden /> Chưa ai nói gì.
          </li>
        )}
      </ol>
      <form
        className="rc-form"
        onSubmit={(event) => {
          event.preventDefault();
          if (text.trim()) say(text.trim());
          setText("");
        }}
      >
        <span className="input">
          <input aria-label="Tin nhắn" value={text} maxLength={300} onChange={(e) => setText(e.target.value)} placeholder="Nói gì đó… 🙂" disabled={disabled} />
        </span>
        {["👍", "😂", "😱"].map((emoji) => (
          <button key={emoji} type="button" className="rc-emoji" onClick={() => say(emoji)} aria-label={`Gửi ${emoji}`} disabled={disabled}>
            {emoji}
          </button>
        ))}
        <IconButton label="Gửi" type="submit" disabled={disabled}>
          <Send size={17} aria-hidden />
        </IconButton>
      </form>
    </Panel>
  );
}
