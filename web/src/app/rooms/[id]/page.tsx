import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { RoomScreen } from "@/rooms/RoomScreen";
import { d1Viewport } from "@/ui/viewport";

export const viewport = d1Viewport;
export const metadata: Metadata = { title: "Phòng — Poker Friends" };

export default async function RoomPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ moi?: string; vao?: string }> }) {
  const [{ id }, { moi, vao }] = await Promise.all([params, searchParams]);
  if (!/^\d+$/.test(id)) notFound();
  // ?moi=1: just created (from /rooms/new); ?vao=1: just joined through an invite link.
  return <RoomScreen roomId={Number(id)} greet={moi === "1" ? "created" : vao === "1" ? "joined" : undefined} key={id} />;
}
