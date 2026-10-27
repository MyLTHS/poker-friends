import { notFound } from "next/navigation";

import { RoomScreen } from "@/rooms/RoomScreen";

export default async function RoomPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^\d+$/.test(id)) notFound();
  return <RoomScreen roomId={Number(id)} key={id} />;
}
