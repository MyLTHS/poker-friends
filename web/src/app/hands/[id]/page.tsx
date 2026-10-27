import { notFound } from "next/navigation";

import { ReplayScreen } from "@/rooms/ReplayScreen";

export default async function ReplayPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^\d+$/.test(id)) notFound();
  return <ReplayScreen handId={Number(id)} key={id} />;
}
