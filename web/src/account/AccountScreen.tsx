"use client";

// /account: the login for a visitor, the upgrade for a guest, the profile for a member. Google's
// result arrives as ?google= / ?error= (see app/account/page.tsx) and shows on whichever screen.
import { useEffect, useMemo, useState } from "react";

import { D1Root, LoadingLine } from "@/ui";

import { createAuthApi, type Me } from "./api";
import { LoginScreen } from "./LoginScreen";
import type { Notice } from "./messages";
import { loadMyRooms, type MyRooms } from "./myRooms";
import { ProfileScreen } from "./ProfileScreen";
import { UpgradeScreen } from "./UpgradeScreen";
import { useAuthBoot } from "./useAuthBoot";

const NOTICE_SECONDS = 6;

export function AccountScreen({ initialNotice }: { initialNotice: Notice | null }) {
  const api = useMemo(() => createAuthApi(), []);
  const [boot, setMe] = useAuthBoot(api);
  const [notice, setNotice] = useState<Notice | null>(initialNotice);
  const rooms = useMyRooms(boot.me);

  useEffect(() => {
    // Drop ?google= / ?error= so a reload does not show it again.
    if (initialNotice) window.history.replaceState(null, "", "/account");
  }, [initialNotice]);

  useEffect(() => {
    // "Đã đăng nhập." and the like fade out; errors stay until the next action.
    if (notice?.kind !== "ok") return;
    const timer = window.setTimeout(() => setNotice(null), NOTICE_SECONDS * 1000);
    return () => window.clearTimeout(timer);
  }, [notice]);

  const done = (me: Me | null, text?: string) => {
    setMe(me);
    setNotice(text ? { kind: "ok", text } : null);
  };
  const shown = notice ?? (boot.error ? { kind: "error" as const, text: boot.error } : null);
  const googleEnabled = boot.config?.google_enabled ?? false;

  if (!boot.loaded) {
    return (
      <D1Root bg="auth" className="auth-loading">
        <LoadingLine>Đang tải tài khoản…</LoadingLine>
      </D1Root>
    );
  }
  if (!boot.me) return <LoginScreen api={api} googleEnabled={googleEnabled} notice={shown} onDone={done} />;
  if (boot.me.is_guest) {
    return <UpgradeScreen api={api} me={boot.me} googleEnabled={googleEnabled} rooms={rooms} notice={shown} onDone={done} />;
  }
  return <ProfileScreen api={api} me={boot.me} rooms={rooms} notice={shown} onDone={done} />;
}

/** undefined while loading (or logged out), null when it failed. */
function useMyRooms(me: Me | null): MyRooms | null | undefined {
  const [state, setState] = useState<{ forId: number; rooms: MyRooms | null } | null>(null);
  useEffect(() => {
    if (!me) return;
    let cancelled = false;
    void loadMyRooms(me).then((result) => {
      if (!cancelled) setState({ forId: me.id, rooms: result.ok ? result.data : null });
    });
    return () => {
      cancelled = true;
    };
  }, [me]);
  return me && state?.forId === me.id ? state.rooms : undefined;
}
