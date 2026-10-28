import type { Viewport } from "next";
import type { ReactNode } from "react";

import "@/account/account.css";
import { d1Viewport } from "@/ui/viewport";

// Every account page is D1: viewport-fit=cover for the landscape phone (ui/viewport.ts). They are
// forms, so the keyboard resizes the page on Android (the box being typed in stays above it)
// instead of covering its lower half; account/frame.tsx does the same for iOS.
export const viewport: Viewport = { ...d1Viewport, interactiveWidget: "resizes-content" };

export default function AccountLayout({ children }: { children: ReactNode }) {
  return children;
}
