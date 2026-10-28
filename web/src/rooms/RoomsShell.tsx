"use client";

// The frame of every room screen: the D1 AppShell (top bar / wood rail / phone app bar), toasts,
// the "no network" banner and the page's entrance (docs/c2-chuyen-dong.md).
import { useCallback, useEffect, useRef, type ComponentProps, type ReactNode, type RefObject } from "react";
import { WifiOff } from "lucide-react";

import type { Me } from "@/account/api";
import { AppShell, ToastProvider, useToast } from "@/ui";

import { useOnline } from "./hooks";
import "./rooms.css";

type ShowToast = ReturnType<typeof useToast>;

/** A toast function for a screen whose state sits above its <RoomsShell> (the provider is inside
 *  the shell, since toasts must render under the .d1 root). Pass `ref` to the shell. */
export function useShellToast(): [ShowToast, RefObject<ShowToast | null>] {
  const ref = useRef<ShowToast | null>(null);
  const toast = useCallback<ShowToast>((t) => ref.current?.(t), []);
  return [toast, ref];
}

function ToastBridge({ targetRef }: { targetRef: RefObject<ShowToast | null> }) {
  const show = useToast();
  useEffect(() => {
    targetRef.current = show;
  }, [show, targetRef]);
  return null;
}

export function OfflineBanner() {
  return (
    <p className="net-banner" role="status">
      <WifiOff size={16} strokeWidth={2} aria-hidden />
      <span>
        <b>Mất mạng.</b> Đang chờ có mạng lại — bàn và chip của bạn vẫn an toàn.
      </span>
    </p>
  );
}

export function RoomsShell({
  me,
  toastRef,
  className = "",
  children,
  ...shell
}: { me?: Me | null; toastRef?: RefObject<ShowToast | null>; className?: string; children: ReactNode } & Omit<ComponentProps<typeof AppShell>, "me" | "children">) {
  const online = useOnline();
  return (
    <AppShell {...shell} me={me ? { name: me.username, href: "/account" } : undefined}>
      <ToastProvider>
        {toastRef && <ToastBridge targetRef={toastRef} />}
        {!online && <OfflineBanner />}
        <div className={`rooms-page ${className}`}>{children}</div>
      </ToastProvider>
    </AppShell>
  );
}
