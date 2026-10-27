import { notFound } from "next/navigation";

import { LiveTableScreen } from "@/rooms/LiveTableScreen";

export default async function LiveTablePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^\d+$/.test(id)) notFound();
  return <LiveTableScreen roomId={Number(id)} key={id} />;
}
