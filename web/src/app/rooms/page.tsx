import type { Metadata } from "next";

import { LobbyScreen } from "@/rooms/LobbyScreen";
import { d1Viewport } from "@/ui/viewport";

export const viewport = d1Viewport;
export const metadata: Metadata = { title: "Sảnh — Poker Friends" };

export default function RoomsPage() {
  return <LobbyScreen />;
}
