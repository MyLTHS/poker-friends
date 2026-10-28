"use client";

// /account: the login for a visitor, the upgrade for a guest, the profile for a member. Google's
// result arrives as ?google= / ?error= (see app/account/page.tsx) and shows on whichever screen.
// Members only (server GUESTS_ALLOWED off, account/members.ts): any real account plays; an old
// guest is told to upgrade; after logging in the player goes back to `next` (the page that sent
// them here, an invite link with its token).
import { useEffect, useMemo, useState } from "react";

import { D1Root, LoadingLine } from "@/ui";

import { createAuthApi, type Me } from "./api";
import { LoginScreen } from "./LoginScreen";
import { loginPath, takeRememberedNext } from "./members";
import type { Notice } from "./messages";
import { loadMyRooms, type MyRooms } from "./myRooms";
import { ProfileScreen } from "./ProfileScreen";
import { UpgradeScreen } from "./UpgradeScreen";
import { useAuthBoot } from "./useAuthBoot";

const NOTICE_SECONDS = 6;

const GUEST_NOW_MEMBERS_ONLY: Notice = {
  kind: "error",
  text: "Giờ bàn chỉ dành cho thành viên. Nâng cấp tài khoản khách này (giữ nguyên chip) là vào chơi được.",
};

/** `next`: already checked by safeNext (app/account/page.tsx). */
export function AccountScreen({ initialNotice, next = null }: { initialNotice: Notice | null; next?: string | null }) {
  const api = useMemo(() => createAuthApi(), []);
  const [boot, setMe] = useAuthBoot(api);
  const [notice, setNotice] = useState<Notice | null>(initialNotice);
  const rooms = useMyRooms(boot.me);
  const membersOnly = boot.config?.guests_allowed === false;

  useEffect(() => {
    // Drop ?google= / ?error= so a reload does not show it again (keep ?next=).
    if (initialNotice) window.history.replaceState(null, "", loginPath(next));
  }, [initialNotice, next]);

  // A member who was sent here (or comes back with a link to follow) goes on at once. Google's
  // flow comes back without ?next= (/account?google=ok): then the page remembered before leaving
  // for Google is the one. Taking it clears it, so an old link cannot fire days later.
  useEffect(() => {
    if (!boot.loaded || !boot.me?.member) return;
    const fromGoogle = initialNotice?.kind === "ok";
    const remembered = next || fromGoogle ? takeRememberedNext() : null;
    const target = next ?? remembered;
    if (target) window.location.replace(target);
  }, [boot.loaded, boot.me, next, initialNotice]);

  useEffect(() => {
    // "Đã đăng nhập." and the like fade out; errors stay until the next action.
    if (notice?.kind !== "ok") return;
    const timer = window.setTimeout(() => setNotice(null), NOTICE_SECONDS * 1000);
    return () => window.clearTimeout(timer);
  }, [notice]);

  const done = (me: Me | null, text?: string) => {
    // In at last: back to the page that sent the player here, or the invite they signed up from.
    // The remembered one is taken (and so cleared) even when ?next= wins, so it cannot go stale.
    if (me?.member) {
      const remembered = takeRememberedNext();
      const target = next ?? remembered;
      if (target) {
        window.location.assign(target);
        return;
      }
    }
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
  if (!boot.me) return <LoginScreen api={api} googleEnabled={googleEnabled} membersOnly={membersOnly} next={next} notice={shown} onDone={done} />;
  if (boot.me.is_guest) {
    const guestNotice = shown ?? (membersOnly ? GUEST_NOW_MEMBERS_ONLY : null);
    return <UpgradeScreen api={api} me={boot.me} googleEnabled={googleEnabled} rooms={rooms} notice={guestNotice} onDone={done} />;
  }
  return <ProfileScreen api={api} me={boot.me} rooms={rooms} notice={shown} onDone={done} />;
}

/** undefined while loading (or logged out), null when it failed. Loaded once per player: the
 *  lobby plus one summary per room is many requests, and a new `me` for the same player (the
 *  upgrade, a notice) changes none of it. A new name only changes "bàn làm chủ". */
function useMyRooms(me: Me | null): MyRooms | null | undefined {
  const [state, setState] = useState<{ forId: number; rooms: MyRooms | null } | null>(null);
  // Members only: the room API refuses anyone else, so do not ask (shown as "could not load").
  const id = me?.member ? me.id : undefined;
  const username = me?.username;
  useEffect(() => {
    if (id === undefined || username === undefined) return;
    let cancelled = false;
    void loadMyRooms({ id, username }).then((result) => {
      if (!cancelled) setState({ forId: id, rooms: result.ok ? result.data : null });
    });
    return () => {
      cancelled = true;
    };
  }, [id, username]);
  if (me && !me.member) return null;
  return me && state?.forId === me.id ? state.rooms : undefined;
}
