import { notFound } from "next/navigation";

import { ReplayScreen } from "@/rooms/ReplayScreen";
import { d1Viewport } from "@/ui/viewport";

// D1 table: landscape phones draw under the notch, the page keeps its own insets (ui/viewport.ts).
export const viewport = d1Viewport;

export default async function ReplayPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^\d+$/.test(id)) notFound();
  return <ReplayScreen handId={Number(id)} key={id} />;
}
