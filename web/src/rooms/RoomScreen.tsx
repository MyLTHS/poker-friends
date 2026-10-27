"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";

import { createAuthApi, type Result } from "@/account/api";
import { errorText, type Notice } from "@/account/messages";
import { Card, formValues, NoticeBox, Shell, Submit, useSubmit } from "@/account/ui";

import { createRoomsApi, inviteUrl, type RoomDetail, type RoomsApi, type TableSnapshot } from "./api";
import { NumberField } from "./LobbyScreen";
import { useRoomLive } from "./useRoomLive";

type State = { detail: RoomDetail; table: TableSnapshot["table"] } | { error: Notice };

async function loadRoom(rooms: RoomsApi, id: number): Promise<State> {
  const detail = await rooms.get(id);
  if (!detail.ok) return { error: { kind: "error", text: errorText(detail.error) } };
  const snapshot = await rooms.snapshot(id);
  if (!snapshot.ok) return { error: { kind: "error", text: errorText(snapshot.error) } };
  return { detail: detail.data, table: snapshot.data.table };
}

const STATUS_TEXT: Record<string, string> = {
  open: "ĐANG MỞ",
  playing: "ĐANG CHƠI",
  suspended: "TẠM DỪNG",
  closed: "ĐÃ ĐÓNG",
};

/**
 * /rooms/<id> — seats, chat, spectators and the owner's panel (B7/B8 test page). The WebSocket
 * brings chat and says when the table changed; the table itself is reloaded over REST (the live
 * table view is B4b). A slow REST poll covers a dropped socket.
 */
export function RoomScreen({ roomId }: { roomId: number }) {
  const rooms = useMemo(() => createRoomsApi(), []);
  const auth = useMemo(() => createAuthApi(), []);
  const [state, setState] = useState<State | null>(null);
  const [notice, setNotice] = useState<Notice | null>(null);

  const refresh = useCallback(() => loadRoom(rooms, roomId).then(setState), [rooms, roomId]);
  const { live, say } = useRoomLive(rooms, roomId, state !== null && !("error" in state));

  useEffect(() => {
    if (live.tableChanges > 0) void loadRoom(rooms, roomId).then(setState);
  }, [live.tableChanges, rooms, roomId]);

  useEffect(() => {
    let cancelled = false;
    const tick = () =>
      loadRoom(rooms, roomId).then((next) => {
        if (!cancelled) setState(next);
      });
    auth.config().then(tick);
    const timer = window.setInterval(tick, 10000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [auth, rooms, roomId]);

  if (state === null) return <Shell title="Phòng" section="PHÒNG">Đang tải…</Shell>;
  if ("error" in state) {
    return (
      <Shell title="Phòng" section="PHÒNG">
        <NoticeBox notice={state.error} />
        <Link href="/rooms" className="btn btn-secondary text-sm">
          Về lobby
        </Link>
      </Shell>
    );
  }

  const { detail, table } = state;
  const room = detail.room;
  const mySeat = table.you.seat;
  const act: Act = async (action, done) => {
    const result = await action();
    setNotice(result.ok ? { kind: "ok", text: done } : { kind: "error", text: errorText(result.error, result.retryAfter) });
    await refresh();
  };

  return (
    <Shell title={room.name} section="PHÒNG" wide>
      <Card>
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <span className={`pill ${room.status === "closed" ? "pill-red" : "pill-green"}`}>{STATUS_TEXT[room.status]}</span>
          {detail.is_private && <span className="pill pill-gold">RIÊNG</span>}
          {detail.closing && <span className="pill pill-red">ĐÓNG SAU VÁN NÀY</span>}
          <span className="text-[var(--muted)]">
            Blind {room.small_blind}/{room.big_blind} · {room.think_time_seconds} giây/lượt · thưởng 7-2:{" "}
            {room.seven_deuce_bonus || "tắt"} · chủ phòng {detail.owner_name ?? "?"}
          </span>
        </div>
        {detail.pending && (
          <p className="mt-2 text-xs text-[var(--muted)]">Thay đổi chờ ván sau: {JSON.stringify(detail.pending)}</p>
        )}
      </Card>
      <NoticeBox notice={notice} />

      <Card>
        <h2 className="font-[family-name:var(--font-display)] text-xl">Ghế</h2>
        <ul className="mt-4 grid gap-2">
          {Array.from({ length: room.max_seats }, (_, i) => i + 1).map((n) => {
            const occupant = table.seats.find((s) => s.seat === n);
            return (
              <li key={n} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-[var(--line)] px-4 py-3">
                <span className="text-sm">
                  <span className="text-[var(--muted)]">Ghế {n} · </span>
                  {occupant ? (
                    <>
                      <b>{occupant.display_name}</b> · {occupant.stack} chip
                      {occupant.sitting_out && " · nghỉ"}
                      {!occupant.connected && " · mất kết nối"}
                      {occupant.seat === mySeat && " · (bạn)"}
                    </>
                  ) : (
                    <span className="text-[var(--muted)]">trống</span>
                  )}
                </span>
                <span className="flex flex-wrap gap-2 [&_button]:whitespace-nowrap">
                  {!occupant && mySeat === null && room.status !== "closed" && (
                    <button className="btn btn-secondary text-xs" onClick={() => act(() => rooms.takeSeat(roomId, n), `Đã ngồi ghế ${n}.`)}>
                      Ngồi đây
                    </button>
                  )}
                  {occupant && occupant.seat === mySeat && (
                    <button className="btn btn-ghost text-xs" onClick={() => act(() => rooms.leaveSeat(roomId), "Đã rời ghế.")}>
                      Rời ghế
                    </button>
                  )}
                  {occupant && detail.is_owner && (
                    <OwnerSeatTools
                      rooms={rooms}
                      roomId={roomId}
                      playerId={occupant.player_id}
                      name={occupant.display_name}
                      canKick={occupant.player_id !== detail.owner_id}
                      act={act}
                    />
                  )}
                </span>
              </li>
            );
          })}
        </ul>
      </Card>

      {live.closedBy && (
        <NoticeBox
          notice={{
            kind: "error",
            text: live.closedBy === "kicked" ? "Chủ phòng đã mời bạn ra khỏi phòng." : "Bạn không có quyền xem phòng này.",
          }}
        />
      )}
      <ChatPanel live={live} say={say} />
      <Link href={`/rooms/${roomId}/history`} className="btn btn-secondary text-sm">
        Lịch sử ván và bảng lời/lỗ
      </Link>
      {detail.is_owner && (
        <OwnerPanel rooms={rooms} detail={detail} act={act} refresh={refresh} onSaved={setNotice} />
      )}
      <Link href="/rooms" className="btn btn-ghost text-sm">
        Về lobby
      </Link>
    </Shell>
  );
}

type Act = (action: () => Promise<Result<unknown>>, done: string) => Promise<void>;

function OwnerSeatTools({
  rooms,
  roomId,
  playerId,
  name,
  canKick,
  act,
}: {
  rooms: RoomsApi;
  roomId: number;
  playerId: string;
  name: string;
  canKick: boolean;
  act: Act;
}) {
  const [amount, setAmount] = useState("100");
  return (
    <>
      <input
        aria-label={`Số chip cho ${name}`}
        value={amount}
        onChange={(event) => setAmount(event.target.value)}
        inputMode="numeric"
        className="w-20 rounded-lg border border-[var(--line)] bg-[var(--canvas)] px-2 text-sm text-[var(--ink)]"
      />
      <button
        className="btn btn-secondary text-xs"
        onClick={() => act(() => rooms.grantChips(roomId, { player_id: playerId, amount: Number(amount) }), `Đã ghi ${amount} chip cho ${name}.`)}
      >
        Cấp chip
      </button>
      {canKick && (
        <button
          className="btn btn-danger text-xs"
          onClick={() => {
            if (window.confirm(`Mời ${name} ra khỏi phòng? Người đó không vào lại được.`)) {
              void act(() => rooms.kick(roomId, playerId), `Đã mời ${name} ra khỏi phòng.`);
            }
          }}
        >
          Kick
        </button>
      )}
    </>
  );
}

function OwnerPanel({
  rooms,
  detail,
  act,
  refresh,
  onSaved,
}: {
  rooms: RoomsApi;
  detail: RoomDetail;
  act: Act;
  refresh: () => Promise<void>;
  onSaved: (notice: Notice) => void;
}) {
  const router = useRouter();
  const settings = useSubmit();
  const room = detail.room;
  const link = detail.invite_token ? inviteUrl(window.location.origin, detail.invite_token) : null;
  return (
    <Card>
      <h2 className="font-[family-name:var(--font-display)] text-xl">Bảng chủ phòng</h2>
      {link && (
        <div className="mt-4 grid gap-2 text-sm">
          <span className="font-bold">Link mời</span>
          <code className="break-all rounded-lg bg-[var(--canvas)] px-3 py-2 text-xs">{link}</code>
          <span className="flex gap-2">
            <button className="btn btn-secondary text-xs" onClick={() => navigator.clipboard?.writeText(link)}>
              Chép link
            </button>
            <button className="btn btn-ghost text-xs" onClick={() => act(() => rooms.rotateInvite(room.room_id), "Đã đổi link mời; link cũ hết dùng được.")}>
              Đổi link
            </button>
          </span>
        </div>
      )}
      <form
        className="mt-6 grid gap-4 sm:grid-cols-2"
        onSubmit={async (event) => {
          const values = formValues(event);
          const changes = Object.fromEntries(
            ["small_blind", "big_blind", "think_time_seconds", "seven_deuce_bonus"].map((key) => [key, Number(values[key])]),
          );
          const result = await settings.run(() => rooms.update(room.room_id, changes));
          if (result.ok) {
            const waiting = result.data.pending ? " Đang có ván: áp dụng từ ván sau." : "";
            onSaved({ kind: "ok", text: `Đã lưu cấu hình.${waiting}` });
            await refresh();
          }
        }}
      >
        <h3 className="font-bold sm:col-span-2">Cấu hình (đang có ván thì áp từ ván sau)</h3>
        <div className="sm:col-span-2">
          <NoticeBox notice={settings.notice} />
        </div>
        <NumberField label="Small blind" name="small_blind" value={room.small_blind} errors={settings.fields.small_blind} />
        <NumberField label="Big blind" name="big_blind" value={room.big_blind} errors={settings.fields.big_blind} />
        <NumberField label="Giây suy nghĩ" name="think_time_seconds" value={room.think_time_seconds} errors={settings.fields.think_time_seconds} />
        <NumberField label="Thưởng 7-2" name="seven_deuce_bonus" value={room.seven_deuce_bonus} errors={settings.fields.seven_deuce_bonus} />
        <div className="sm:col-span-2">
          <Submit busy={settings.busy}>Lưu cấu hình</Submit>
        </div>
      </form>
      {room.status !== "closed" && (
        <button
          className="btn btn-danger mt-6 w-full text-sm"
          onClick={() => {
            if (window.confirm("Đóng phòng? Đang có ván thì đóng khi ván xong.")) {
              void act(() => rooms.close(room.room_id), "Đã đóng phòng (hoặc sẽ đóng khi ván xong).").then(() => router.refresh());
            }
          }}
        >
          Đóng phòng
        </button>
      )}
    </Card>
  );
}

function ChatPanel({ live, say }: { live: ReturnType<typeof useRoomLive>["live"]; say: (text: string) => void }) {
  const [text, setText] = useState("");
  return (
    <Card>
      <h2 className="font-[family-name:var(--font-display)] text-xl">Chat</h2>
      <p className="mt-1 text-xs text-[var(--muted)]">
        Đang xem: {live.spectators.length ? live.spectators.map((s) => s.display_name).join(", ") : "không ai"}
      </p>
      <ol className="mt-3 grid max-h-64 gap-1 overflow-y-auto text-sm" aria-live="polite">
        {live.chat.map((line) => (
          <li key={line.message_id}>
            <b>{line.display_name}</b>: {line.text}
          </li>
        ))}
        {live.chat.length === 0 && <li className="text-[var(--muted)]">Chưa ai nói gì.</li>}
      </ol>
      <form
        className="mt-3 flex gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          if (text.trim()) say(text.trim());
          setText("");
        }}
      >
        <input
          aria-label="Tin nhắn"
          value={text}
          maxLength={300}
          onChange={(event) => setText(event.target.value)}
          placeholder="Nói gì đó… 🙂"
          className="min-w-0 flex-1 rounded-xl border border-[var(--line)] bg-[var(--canvas)] px-4 py-2 text-[var(--ink)]"
        />
        {["👍", "😂", "😱"].map((emoji) => (
          <button key={emoji} type="button" className="btn btn-ghost px-2! text-base" onClick={() => say(emoji)} aria-label={`Gửi ${emoji}`}>
            {emoji}
          </button>
        ))}
        <button type="submit" className="btn btn-primary text-xs">
          Gửi
        </button>
      </form>
    </Card>
  );
}
