import { notFound, redirect } from "next/navigation";

// The room is its table now (like Poker Now): old links to /rooms/<id> land there.
// /rooms/<id>/history stays its own page.
export default async function RoomPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^\d+$/.test(id)) notFound();
  redirect(`/rooms/${id}/table`);
}
