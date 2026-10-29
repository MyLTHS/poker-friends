"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Lock } from "lucide-react";

import { errorText } from "@/account/messages";
import { TableScreen, type InviteSlot, type OwnerSlot } from "@/table/TableScreen";
import "@/table/table.css";
import { ButtonLink, D1Root, ErrorState, Sheet, Spinner, useToast } from "@/ui";

import { createRoomsApi, roomSocketUrl, type RoomDetail, type RoomsApi } from "./api";
import { needsName, useMe } from "./hooks";
import { NameGate } from "./NameGate";
import { OwnerSheet } from "./OwnerPanel";
import { ShareCard } from "./RoomBits";

const SOCKET_BASE = process.env.NEXT_PUBLIC_DJANGO_WS ?? "ws://localhost:8000";

/**
 * /rooms/<id>/table — the real table, and the room's only page (/rooms/<id> comes here). A visitor
 * nobody knows yet first says their name (NameGate) when the server takes guests. Then one REST
 * snapshot: it gives a first-time visitor their guest session cookie (a WebSocket handshake
 * cannot) and checks they may see the room. Then the same TableScreen as the mock, on Django's
 * WebSocket, with the room's REST calls (chat history, take/leave a seat), the "Mời bạn" sheet
 * and, for the owner, the owner's sheet over the table. `openInvite` (?moi=1, from /rooms/new):
 * the room was just created, the "Mời bạn" sheet opens once.
 */
export function LiveTableScreen({ roomId, openInvite = false }: { roomId: number; openInvite?: boolean }) {
  const rooms = useMemo(() => createRoomsApi(), []);
  const { me, guestsAllowed, signedIn } = useMe();
  const [state, setState] = useState<"loading" | "ready" | { error: string }>("loading");
  const [detail, setDetail] = useState<RoomDetail | null>(null);
  // Read once: the ?moi=1 leaves the address bar at once, so a reload does not open it again.
  // Through the router, not history.replaceState: Next keeps the rendered ?moi=1 page in the
  // entry, and Back then Forward would open the sheet again.
  const router = useRouter();
  const [inviteFirst] = useState(openInvite);
  useEffect(() => {
    if (openInvite) router.replace(`/rooms/${roomId}/table`);
  }, [openInvite, roomId, router]);

  // Who is there first: the snapshot would make a nameless visitor a guest with a random name.
  const known = me !== undefined && !needsName(me, guestsAllowed);
  useEffect(() => {
    if (!known) return;
    let cancelled = false;
    rooms.snapshot(roomId).then((result) => {
      if (cancelled) return;
      setState(result.ok ? "ready" : { error: errorText(result.error, result.retryAfter) });
      if (result.ok) rooms.get(roomId).then((got) => !cancelled && got.ok && setDetail(got.data));
    });
    return () => {
      cancelled = true;
    };
  }, [known, rooms, roomId]);

  // The owner's sheet reads the room (rules waiting for the next hand, invite link) fresh each time
  // it opens and after every change made in it.
  const reloadDetail = useCallback(async () => {
    const got = await rooms.get(roomId);
    if (got.ok) setDetail(got.data);
  }, [rooms, roomId]);
  const owner = useCallback(
    (slot: OwnerSlot) => detail && <TableOwnerSheet {...slot} detail={detail} reload={reloadDetail} rooms={rooms} />,
    [detail, reloadDetail, rooms],
  );
  // always offered: when the first read of the room failed, opening the sheet reads it again
  const invite = useCallback((slot: InviteSlot) => <TableInviteSheet {...slot} detail={detail} reload={reloadDetail} roomId={roomId} />, [detail, reloadDetail, roomId]);

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
        backHref="/rooms"
        backLabel="Sảnh"
        help={<>Django chạy chưa? Ở thư mục gốc chạy <code>uv run python manage.py runserver</code>.</>}
        loadChat={loadChat}
        onTakeSeat={onTakeSeat}
        onLeaveSeat={onLeaveSeat}
        owner={detail?.is_owner ? owner : undefined}
        invite={invite}
        startWithInvite={inviteFirst}
        replayHref={(handId) => `/hands/${handId}`}
        historyHref={`/rooms/${roomId}/history`}
      />
    );
  }
  if (needsName(me, guestsAllowed)) {
    return (
      <D1Root bg="table" className="tbl-wait">
        <NameGate onDone={signedIn} />
      </D1Root>
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
          <ErrorState title="Không mở được bàn" text={state.error} actions={<ButtonLink kind="primary" href="/rooms">Về sảnh</ButtonLink>} />
        )}
      </div>
    </D1Root>
  );
}

function TableOwnerSheet({ open, onClose, seats, inHand, detail, reload, rooms }: OwnerSlot & { detail: RoomDetail; reload: () => Promise<void>; rooms: RoomsApi }) {
  useEffect(() => {
    if (open) void reload();
  }, [open, reload]);
  return <OwnerSheet open={open} onClose={onClose} detail={detail} seats={seats} inHand={inHand} onChanged={() => void reload()} rooms={rooms} />;
}

/**
 * "Mời bạn": the owner gets the invite link (it lets a friend into a private room too); anyone
 * else may pass on a public room's page. Only the owner has a private room's invite link (the
 * server keeps it from the others), so there the sheet says to ask the owner.
 */
function TableInviteSheet({ open, onClose, detail, reload, roomId }: InviteSlot & { detail: RoomDetail | null; reload: () => Promise<void>; roomId: number }) {
  const toast = useToast();
  // the owner may have changed the link in the owner's sheet since the table opened
  useEffect(() => {
    if (open) void reload();
  }, [open, reload]);
  const onCopied = (ok: boolean) =>
    toast(ok ? { kind: "success", title: "Đã chép link" } : { kind: "danger", title: "Không chép được", text: "Trình duyệt chặn bộ nhớ tạm. Bấm giữ vào link để chép." });
  return (
    <Sheet open={open} onClose={onClose} title="Mời bạn vào bàn">
      {!detail ? (
        <Spinner size={40} />
      ) : detail.invite_token ? (
        <ShareCard detail={detail} onCopied={onCopied} />
      ) : !detail.is_private ? (
        <ShareCard detail={detail} onCopied={onCopied} path={`/rooms/${roomId}/table`} eyebrow="Link phòng công khai" rotateHint={false} />
      ) : (
        <p className="share-note">
          <Lock size={14} aria-hidden /> Phòng riêng: chỉ chủ phòng có link mời. Nhờ chủ phòng bấm Mời bạn rồi gửi link cho bạn của bạn.
        </p>
      )}
    </Sheet>
  );
}
