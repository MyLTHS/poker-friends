import { notFound } from "next/navigation";

import { LiveTableScreen } from "@/rooms/LiveTableScreen";
import { d1Viewport } from "@/ui/viewport";

// D1 table: landscape phones draw under the notch, the page keeps its own insets (ui/viewport.ts).
export const viewport = d1Viewport;

export default async function LiveTablePage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ moi?: string }> }) {
  const [{ id }, { moi }] = await Promise.all([params, searchParams]);
  if (!/^\d+$/.test(id)) notFound();
  // ?moi=1: just created (from /rooms/new): the "Mời bạn" sheet opens once.
  return <LiveTableScreen roomId={Number(id)} openInvite={moi === "1"} key={id} />;
}
