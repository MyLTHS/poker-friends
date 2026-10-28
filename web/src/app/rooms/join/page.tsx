import type { Metadata } from "next";

import { JoinScreen } from "@/rooms/JoinScreen";
import { d1Viewport } from "@/ui/viewport";

export const viewport = d1Viewport;
export const metadata: Metadata = { title: "Link mời — Poker Friends" };

export default async function JoinPage({ searchParams }: { searchParams: Promise<{ token?: string }> }) {
  const { token = "" } = await searchParams;
  return <JoinScreen token={token} key={token} />;
}
