"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

import { errorText, type Notice } from "@/account/messages";
import { NoticeBox, Shell } from "@/account/ui";
import { TableScreen } from "@/table/TableScreen";

import { createRoomsApi, roomSocketUrl } from "./api";

const SOCKET_BASE = process.env.NEXT_PUBLIC_DJANGO_WS ?? "ws://localhost:8000";

/**
 * /rooms/<id>/table — the real table (B4b). One REST snapshot first: it gives a first-time
 * visitor their guest session cookie (a WebSocket handshake cannot) and checks they may see the
 * room. Then the same TableScreen as the mock, on Django's WebSocket.
 */
export function LiveTableScreen({ roomId }: { roomId: number }) {
  const rooms = useMemo(() => createRoomsApi(), []);
  const [state, setState] = useState<"loading" | "ready" | Notice>("loading");

  useEffect(() => {
    let cancelled = false;
    rooms.snapshot(roomId).then((result) => {
      if (cancelled) return;
      setState(result.ok ? "ready" : { kind: "error", text: errorText(result.error, result.retryAfter) });
    });
    return () => {
      cancelled = true;
    };
  }, [rooms, roomId]);

  if (state === "ready") {
    return (
      <TableScreen
        url={roomSocketUrl(SOCKET_BASE, roomId)}
        backHref={`/rooms/${roomId}`}
        backLabel="Về trang phòng"
        help={<>Django chạy chưa? Ở thư mục gốc chạy <code>uv run python manage.py runserver</code>.</>}
      />
    );
  }
  return (
    <Shell title="Bàn chơi" section="PHÒNG">
      {state === "loading" ? <p className="text-sm text-[var(--muted)]">Đang mở bàn…</p> : <NoticeBox notice={state} />}
      <Link href={`/rooms/${roomId}`} className="btn btn-secondary text-sm">
        Về trang phòng
      </Link>
    </Shell>
  );
}
