import type { Metadata, Viewport } from "next";

import { fontVariables } from "@/ui/fonts";
import { RotatePrompt } from "@/ui/RotatePrompt";
import "./globals.css";

export const metadata: Metadata = {
  title: "Poker Friends — trang thử",
  description: "Trang thử bàn chơi nối với mock server.",
};

// D1 pages opt into viewport-fit=cover themselves (ui/viewport.ts); the direction A screens
// have no safe-area padding, so the default stays inside the safe area.
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#0d0a07",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="vi" className={fontVariables}>
      <body>
        {children}
        <RotatePrompt />
      </body>
    </html>
  );
}
