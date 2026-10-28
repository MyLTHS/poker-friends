import { notFound } from "next/navigation";

import { LiveTableScreen } from "@/rooms/LiveTableScreen";
import { d1Viewport } from "@/ui/viewport";

// D1 table: landscape phones draw under the notch, the page keeps its own insets (ui/viewport.ts).
export const viewport = d1Viewport;

export default async function LiveTablePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^\d+$/.test(id)) notFound();
  return <LiveTableScreen roomId={Number(id)} key={id} />;
}
