import type { Metadata, Viewport } from "next";

import { fontVariables } from "@/ui/fonts";
import { RotatePrompt } from "@/ui/RotatePrompt";
import "./globals.css";

export const metadata: Metadata = {
  title: "Poker Friends — trang thử",
  description: "Trang thử bàn chơi nối với mock server.",
};

// viewport-fit=cover: the landscape phone layout draws under the notch and keeps its own 44px
// insets (tokens.css --safe-l / --safe-r).
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
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
