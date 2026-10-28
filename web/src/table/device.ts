"use client";

// Which D1 frame the table draws: the landscape phone (same query as tokens.css / the Tailwind
// `phone:` variant) or the desktop. The server renders the desktop; the browser switches on mount.
import { useSyncExternalStore } from "react";

import type { Device } from "./geometry";

export const PHONE_QUERY = "(orientation: landscape) and (max-height: 500px)";

function subscribe(onChange: () => void) {
  const query = window.matchMedia(PHONE_QUERY);
  query.addEventListener("change", onChange);
  return () => query.removeEventListener("change", onChange);
}

export function useDevice(): Device {
  return useSyncExternalStore(
    subscribe,
    () => (window.matchMedia(PHONE_QUERY).matches ? "mobile" : "desktop"),
    () => "desktop",
  );
}
