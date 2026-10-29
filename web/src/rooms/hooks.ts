"use client";

// Small browser hooks of the room screens: the landscape-phone layout, the network, the player.

import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";

import { createAuthApi, type Me } from "@/account/api";

/** Same query as the `phone:` variant and d1.css. */
export const PHONE_QUERY = "(orientation: landscape) and (max-height: 500px)";

function subscribeMedia(query: string) {
  return (onChange: () => void) => {
    const list = window.matchMedia(query);
    list.addEventListener("change", onChange);
    return () => list.removeEventListener("change", onChange);
  };
}

/** True on the landscape phone. The server (and the first browser render) draw the desktop;
 *  the screens using this load their data after mounting, so the switch happens on a skeleton. */
export function usePhone(): boolean {
  return useSyncExternalStore(
    subscribeMedia(PHONE_QUERY),
    () => window.matchMedia(PHONE_QUERY).matches,
    () => false,
  );
}

function subscribeOnline(onChange: () => void) {
  window.addEventListener("online", onChange);
  window.addEventListener("offline", onChange);
  return () => {
    window.removeEventListener("online", onChange);
    window.removeEventListener("offline", onChange);
  };
}

/** navigator.onLine, live. Says only that the device has no network at all; a server that does
 *  not answer shows up as a network_error from the API instead. */
export function useOnline(): boolean {
  return useSyncExternalStore(subscribeOnline, () => navigator.onLine, () => true);
}

/** Calls `reload` when the network comes back after a drop; returns whether it is up now. */
export function useReloadWhenOnline(reload: () => void) {
  const online = useOnline();
  const latest = useRef(reload);
  useEffect(() => {
    latest.current = reload;
  });
  useEffect(() => {
    const back = () => latest.current();
    window.addEventListener("online", back);
    return () => window.removeEventListener("online", back);
  }, []);
  return online;
}

/** Whole seconds left until `until` (a Date.now() time), ticking every second; 0 when past. For
 *  a 429's Retry-After: the retry button stays locked and says how long. */
export function useCountdown(until: number | undefined): number {
  const subscribe = useCallback(
    (onTick: () => void) => {
      if (!until) return () => undefined;
      const timer = window.setInterval(onTick, 1000);
      return () => window.clearInterval(timer);
    },
    [until],
  );
  return useSyncExternalStore(subscribe, () => (until ? Math.max(0, Math.ceil((until - Date.now()) / 1000)) : 0), () => 0);
}

const never = () => () => undefined;

/** A browser-only value read once on the client (the server and hydration see `server`). */
export function useClientValue<T>(read: () => T, server: T): T {
  return useSyncExternalStore(never, read, () => server);
}

/** The page's origin for links shown on screen (invite links). "" on the server and during
 *  hydration, so nothing reads `window` while rendering there. */
export function useOrigin(): string {
  return useClientValue(() => window.location.origin, "");
}

/** The signed-in player (a guest counts): `undefined` while asking, `null` when nobody is. Also
 *  fetches /api/auth/config/ first, which sets the csrftoken cookie every POST needs, and says
 *  whether the server takes guests (`guestsAllowed`, undefined until known; false: members
 *  only). `reload` asks again (after an invite link made the visitor a guest); `signedIn` takes
 *  the player a form just logged in (the name gate) without asking. */
export function useMe(): {
  me: Me | null | undefined;
  guestsAllowed: boolean | undefined;
  whenReady: () => Promise<void>;
  reload: () => void;
  signedIn: (me: Me) => void;
} {
  const auth = useMemo(() => createAuthApi(), []);
  const [me, setMe] = useState<Me | null | undefined>(undefined);
  const [guestsAllowed, setGuestsAllowed] = useState<boolean | undefined>(undefined);
  const [asked, setAsked] = useState(0);
  const ready = useRef<Promise<void> | null>(null);
  // In effects and handlers only: never fetch while rendering (the server renders too).
  const whenReady = useCallback(
    () =>
      (ready.current ??= auth.config().then((config) => {
        if (config.ok) setGuestsAllowed(config.data.guests_allowed);
      })),
    [auth],
  );
  useEffect(() => {
    let cancelled = false;
    (async () => {
      await whenReady();
      const who = await auth.me();
      if (!cancelled) setMe(who.ok ? who.data : null);
    })();
    return () => {
      cancelled = true;
    };
  }, [auth, whenReady, asked]);
  const reload = useCallback(() => setAsked((n) => n + 1), []);
  return { me, guestsAllowed, whenReady, reload, signedIn: setMe };
}

/** Nobody logged in and the server takes guests: ask for a name (rooms/NameGate.tsx) before any
 *  room call, which would make the visitor a guest with a random name. `undefined`: not known yet. */
export const needsName = (me: Me | null | undefined, guestsAllowed: boolean | undefined) => me === null && guestsAllowed === true;
