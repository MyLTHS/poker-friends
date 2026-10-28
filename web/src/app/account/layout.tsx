import type { ReactNode } from "react";

import "@/account/account.css";
import { d1Viewport } from "@/ui/viewport";

// Every account page is D1: viewport-fit=cover for the landscape phone (ui/viewport.ts).
export const viewport = d1Viewport;

export default function AccountLayout({ children }: { children: ReactNode }) {
  return children;
}
