import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Poker Friends — trang thử",
  description: "Trang thử bàn chơi nối với mock server.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="vi">
      <body>{children}</body>
    </html>
  );
}
