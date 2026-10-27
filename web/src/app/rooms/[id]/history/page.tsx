import { notFound } from "next/navigation";

import { HistoryScreen } from "@/rooms/HistoryScreen";

export default async function RoomHistoryPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^\d+$/.test(id)) notFound();
  return <HistoryScreen roomId={Number(id)} key={id} />;
}
