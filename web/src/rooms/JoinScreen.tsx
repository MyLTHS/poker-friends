"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { ArrowLeft, DoorOpen, Eye, Link2Off, RotateCw, Users } from "lucide-react";

import { errorText } from "@/account/messages";
import { Button, ButtonLink, ErrorState, PageHead, Spinner } from "@/ui";

import { createRoomsApi, type RoomDetail } from "./api";
import { useMe, usePhone } from "./hooks";
import { Invitation, invitationMeta, InviteFrom } from "./RoomBits";
import { RoomsShell } from "./RoomsShell";

type State =
  | { kind: "joining" }
  | { kind: "joined"; detail: RoomDetail; seated?: number }
  | { kind: "error"; code: string; text: string };

/**
 * /rooms/join?token=… — the invite link (D1 "invite", the guest's side). Opening it joins the
 * room (there is no "preview by token" API): not logged in, the server makes the visitor a guest.
 * Then the invitation card says whose room it is, with "Vào phòng" and "Chỉ xem".
 */
export function JoinScreen({ token }: { token: string }) {
  const rooms = useMemo(() => createRoomsApi(), []);
  const { me, whenReady, reload } = useMe();
  const phone = usePhone();
  const [state, setState] = useState<State>(token ? { kind: "joining" } : { kind: "error", code: "no_token", text: "" });

  const join = useCallback(
    () =>
      whenReady()
        .then(() => rooms.join(token))
        .then(async (result): Promise<State> => {
          if (!result.ok) return { kind: "error", code: result.error.code, text: errorText(result.error, result.retryAfter) };
          reload(); // a first-time visitor is a guest now
          const snapshot = await rooms.snapshot(result.data.room.room_id);
          return { kind: "joined", detail: result.data, seated: snapshot.ok ? snapshot.data.table.seats.length : undefined };
        })
        .then(setState),
    [rooms, token, whenReady, reload],
  );

  useEffect(() => {
    if (token) void join();
  }, [join, token]);

  const stage =
    state.kind === "joining" ? (
      <div className="invitation is-waiting" role="status">
        <Spinner size={phone ? 48 : 64} />
        <b>Đang mở thiệp mời…</b>
        <small>Vào phòng bằng link — chưa có tài khoản thì bạn vào bằng khách.</small>
      </div>
    ) : state.kind === "error" ? (
      <div className="invitation is-error">
        <ErrorState
          icon={state.code === "kicked" ? <DoorOpen size={26} strokeWidth={1.9} /> : state.code === "network_error" ? undefined : <Link2Off size={26} strokeWidth={1.9} />}
          title={
            state.code === "no_token"
              ? "Link mời thiếu mã"
              : state.code === "room_not_found"
                ? "Link mời không dùng được"
                : state.code === "kicked"
                  ? "Bạn đã bị mời ra khỏi phòng này"
                  : state.code === "network_error"
                    ? "Không mở được thiệp mời"
                    : "Chưa vào được phòng"
          }
          text={
            state.code === "no_token"
              ? "Link bị cắt mất đoạn ?token=…. Xin chủ phòng gửi lại cả link."
              : state.code === "room_not_found"
                ? "Link sai, hoặc chủ phòng đã đổi link mời. Xin chủ phòng link mới nhé."
                : state.code === "network_error"
                  ? "Mạng đang chập chờn. Thử lại khi có mạng."
                  : state.text
          }
          actions={
            <>
              {(state.code === "network_error" || state.code === "rate_limited") && (
                <Button kind="primary" size="sm" icon={<RotateCw size={15} strokeWidth={2.2} aria-hidden />} onClick={() => (setState({ kind: "joining" }), void join())}>
                  Thử lại
                </Button>
              )}
              <ButtonLink kind="ghost" size="sm" href="/rooms" icon={<ArrowLeft size={15} aria-hidden />}>
                Về sảnh
              </ButtonLink>
            </>
          }
        />
      </div>
    ) : (
      <Invitation
        from={state.detail.owner_name ? <InviteFrom name={state.detail.owner_name} /> : undefined}
        title={state.detail.room.name}
        meta={invitationMeta(state.detail.room, state.seated)}
        live={
          state.detail.room.status === "playing" ? (
            <>
              <i className="dot is-live" aria-hidden /> Đang chơi
            </>
          ) : state.detail.room.status === "closed" ? (
            "Phòng đã đóng"
          ) : (
            <>
              <i className="dot" aria-hidden /> Đang mở · chờ người ngồi
            </>
          )
        }
        actions={
          <>
            <ButtonLink kind="felt" size="lg" href={`/rooms/${state.detail.room.room_id}`} icon={<Users size={17} aria-hidden />}>
              Vào phòng
            </ButtonLink>
            <ButtonLink kind="paper" size="lg" href={`/rooms/${state.detail.room.room_id}/table`} icon={<Eye size={17} aria-hidden />}>
              Chỉ xem
            </ButtonLink>
          </>
        }
        who={
          me ? (
            <>
              {me.is_guest ? "Bạn vào bằng khách " : "Bạn đang đăng nhập là "}
              <b>{me.username}</b> · <Link href="/account">{me.is_guest ? "đăng nhập" : "đổi tài khoản"}</Link>
            </>
          ) : undefined
        }
      />
    );

  return (
    <RoomsShell me={me} sub={phone ? { title: "Link mời", sub: "Một link cho cả hội", back: "/rooms" } : undefined} className="join-page">
      {!phone && <PageHead eyebrow="Bạn được mời" title="Link mời" sub="Ai có link đều vào được, kể cả khi chưa có tài khoản." />}
      <div className="invite-stage is-full">{stage}</div>
    </RoomsShell>
  );
}
