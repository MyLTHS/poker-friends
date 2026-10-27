"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

import { createAuthApi } from "@/account/api";
import { errorText, type Notice } from "@/account/messages";
import { NoticeBox, Shell } from "@/account/ui";

import { createRoomsApi } from "./api";

/** /rooms/join?token=… — the invite link. Not logged in? The server makes you a guest. */
export function JoinScreen({ token }: { token: string }) {
  const router = useRouter();
  const rooms = useMemo(() => createRoomsApi(), []);
  const auth = useMemo(() => createAuthApi(), []);
  const [notice, setNotice] = useState<Notice | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      await auth.config(); // csrftoken cookie
      const result = await rooms.join(token);
      if (cancelled) return;
      if (result.ok) router.replace(`/rooms/${result.data.room.room_id}`);
      else setNotice({ kind: "error", text: errorText(result.error) });
    })();
    return () => {
      cancelled = true;
    };
  }, [auth, rooms, router, token]);

  return (
    <Shell title="Vào phòng" section="LINK MỜI">
      {notice ? <NoticeBox notice={notice} /> : <p className="text-sm text-[var(--muted)]">Đang vào phòng…</p>}
      <Link href="/rooms" className="btn btn-secondary text-sm">
        Về lobby
      </Link>
    </Shell>
  );
}
