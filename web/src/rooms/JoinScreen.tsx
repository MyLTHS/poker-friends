"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { ArrowLeft, DoorOpen, Link2Off, RotateCw } from "lucide-react";

import { errorText } from "@/account/messages";
import { Button, ButtonLink, ErrorState, PageHead, Spinner } from "@/ui";

import { createRoomsApi } from "./api";
import { useCountdown, useMe, usePhone, useReloadWhenOnline } from "./hooks";
import { RoomsShell } from "./RoomsShell";

type State = { kind: "joining" } | { kind: "error"; code: string; text: string; retryAt?: number };

const TITLE: Record<string, string> = {
  no_token: "Link mời thiếu mã",
  room_not_found: "Link mời không dùng được",
  kicked: "Bạn đã bị mời ra khỏi phòng này",
  network_error: "Không mở được link mời",
  rate_limited: "Thử vào quá nhiều lần",
  login_required: "Cần đăng nhập để vào phòng",
};

const TEXT: Record<string, string> = {
  no_token: "Link bị cắt mất đoạn ?token=…. Xin chủ phòng gửi lại cả link.",
  room_not_found: "Link sai, hoặc chủ phòng đã đổi link mời. Xin chủ phòng link mới nhé.",
  network_error: "Mạng đang chập chờn. Có mạng lại là tự thử lại.",
  // members only: the page is leaving for the login (keeping this link)
  login_required: "Phòng chỉ dành cho thành viên. Đang mở trang đăng nhập; đăng nhập (hoặc đăng ký) xong bạn vào thẳng phòng.",
};

/**
 * /rooms/join?token=… — the invite link. Opening it joins the room (not logged in, the server
 * makes the visitor a guest; members only, the API answers login_required and the visitor logs
 * in first, coming back to this link: account/members.ts), then *replaces* this address with the
 * room page, which greets the
 * newcomer with the invitation card: the token leaves the address bar and the history, so Back
 * never sends it again (an owner may have changed the link since).
 */
export function JoinScreen({ token }: { token: string }) {
  const rooms = useMemo(() => createRoomsApi(), []);
  const router = useRouter();
  const { me, guestsAllowed, whenReady } = useMe();
  const phone = usePhone();
  const [state, setState] = useState<State>(token ? { kind: "joining" } : { kind: "error", code: "no_token", text: "" });

  const join = useCallback(
    () =>
      whenReady()
        .then(() => rooms.join(token))
        .then((result) => {
          if (result.ok) router.replace(`/rooms/${result.data.room.room_id}?vao=1`);
          else
            setState({
              kind: "error",
              code: result.error.code,
              text: errorText(result.error, result.retryAfter),
              // 429: the server says when it will listen again
              retryAt: result.error.code === "rate_limited" ? Date.now() + (result.retryAfter ?? 60) * 1000 : undefined,
            });
        }),
    [rooms, router, token, whenReady],
  );

  useEffect(() => {
    if (token) void join();
  }, [join, token]);
  useReloadWhenOnline(
    useCallback(() => {
      if (state.kind === "error" && state.code === "network_error") {
        setState({ kind: "joining" });
        void join();
      }
    }, [join, state]),
  );
  const wait = useCountdown(state.kind === "error" ? state.retryAt : undefined);

  const stage =
    state.kind === "joining" ? (
      <div className="invitation is-waiting" role="status">
        <Spinner size={phone ? 48 : 64} />
        <b>Đang mở thiệp mời…</b>
        <small>
          {guestsAllowed === false
            ? "Phòng chỉ dành cho thành viên: chưa đăng nhập thì đăng nhập trước, xong là vào thẳng phòng."
            : "Vào phòng bằng link — chưa có tài khoản thì bạn vào bằng khách."}
        </small>
      </div>
    ) : (
      <div className="invitation is-error">
        <ErrorState
          icon={state.code === "kicked" ? <DoorOpen size={26} strokeWidth={1.9} /> : state.code === "network_error" ? undefined : <Link2Off size={26} strokeWidth={1.9} />}
          title={TITLE[state.code] ?? "Chưa vào được phòng"}
          text={TEXT[state.code] ?? state.text}
          actions={
            <>
              {(state.code === "network_error" || state.code === "rate_limited") && (
                <Button
                  kind="primary"
                  size="sm"
                  icon={<RotateCw size={15} strokeWidth={2.2} aria-hidden />}
                  disabled={wait > 0}
                  onClick={() => (setState({ kind: "joining" }), void join())}
                >
                  {wait > 0 ? `Thử lại sau ${wait} giây` : "Thử lại"}
                </Button>
              )}
              <ButtonLink kind="ghost" size="sm" href="/rooms" icon={<ArrowLeft size={15} aria-hidden />}>
                Về sảnh
              </ButtonLink>
            </>
          }
        />
      </div>
    );

  return (
    <RoomsShell me={me} sub={phone ? { title: "Link mời", sub: "Một link cho cả hội", back: "/rooms" } : undefined} className="join-page">
      {!phone && <PageHead eyebrow="Bạn được mời" title="Link mời" sub="Ai có link đều vào được, kể cả khi chưa có tài khoản." />}
      <div className="invite-stage is-full">{stage}</div>
    </RoomsShell>
  );
}
