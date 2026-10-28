"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import { errorText } from "@/account/messages";
import { TableScreen } from "@/table/TableScreen";
import "@/table/table.css";
import { ButtonLink, D1Root, ErrorState, Spinner } from "@/ui";

import { createRoomsApi, roomSocketUrl } from "./api";

const SOCKET_BASE = process.env.NEXT_PUBLIC_DJANGO_WS ?? "ws://localhost:8000";

/**
 * /rooms/<id>/table — the real table. One REST snapshot first: it gives a first-time visitor
 * their guest session cookie (a WebSocket handshake cannot) and checks they may see the room.
 * Then the same TableScreen as the mock, on Django's WebSocket, with the room's REST calls
 * (chat history, take/leave a seat) and the owner's link.
 */
export function LiveTableScreen({ roomId }: { roomId: number }) {
  const rooms = useMemo(() => createRoomsApi(), []);
  const [state, setState] = useState<"loading" | "ready" | { error: string }>("loading");
  const [owner, setOwner] = useState(false);

  useEffect(() => {
    let cancelled = false;
    rooms.snapshot(roomId).then((result) => {
      if (cancelled) return;
      setState(result.ok ? "ready" : { error: errorText(result.error, result.retryAfter) });
      if (result.ok) rooms.get(roomId).then((detail) => !cancelled && detail.ok && setOwner(detail.data.is_owner));
    });
    return () => {
      cancelled = true;
    };
  }, [rooms, roomId]);

  const loadChat = useCallback(async () => {
    const result = await rooms.chat(roomId);
    return result.ok ? result.data.messages : [];
  }, [rooms, roomId]);
  const onTakeSeat = useCallback(
    async (seat: number) => {
      const result = await rooms.takeSeat(roomId, seat);
      return result.ok ? null : errorText(result.error, result.retryAfter);
    },
    [rooms, roomId],
  );
  const onLeaveSeat = useCallback(async () => {
    const result = await rooms.leaveSeat(roomId);
    return result.ok ? null : errorText(result.error, result.retryAfter);
  }, [rooms, roomId]);

  if (state === "ready") {
    return (
      <TableScreen
        url={roomSocketUrl(SOCKET_BASE, roomId)}
        backHref={`/rooms/${roomId}`}
        backLabel="Phòng"
        help={<>Django chạy chưa? Ở thư mục gốc chạy <code>uv run python manage.py runserver</code>.</>}
        loadChat={loadChat}
        onTakeSeat={onTakeSeat}
        onLeaveSeat={onLeaveSeat}
        ownerHref={owner ? `/rooms/${roomId}` : undefined}
        replayHref={(handId) => `/hands/${handId}`}
      />
    );
  }
  return (
    <D1Root bg="table" className="tbl-wait">
      <div className="tbl-wait-box">
        {state === "loading" ? (
          <>
            <Spinner size={56} />
            <b>Đang mở bàn…</b>
          </>
        ) : (
          <ErrorState title="Không mở được bàn" text={state.error} actions={<ButtonLink kind="primary" href={`/rooms/${roomId}`}>Về trang phòng</ButtonLink>} />
        )}
      </div>
    </D1Root>
  );
}
