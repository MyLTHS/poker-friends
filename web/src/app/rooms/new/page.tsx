import type { Metadata } from "next";

import { CreateRoomScreen } from "@/rooms/CreateRoomScreen";
import { d1Viewport } from "@/ui/viewport";

export const viewport = d1Viewport;
export const metadata: Metadata = { title: "Tạo phòng — Poker Friends" };

export default function NewRoomPage() {
  return <CreateRoomScreen />;
}
