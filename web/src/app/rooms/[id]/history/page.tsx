import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { HistoryScreen } from "@/rooms/HistoryScreen";
import { d1Viewport } from "@/ui/viewport";

export const viewport = d1Viewport;
export const metadata: Metadata = { title: "Lịch sử phòng — Poker Friends" };

export default async function RoomHistoryPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^\d+$/.test(id)) notFound();
  return <HistoryScreen roomId={Number(id)} key={id} />;
}
