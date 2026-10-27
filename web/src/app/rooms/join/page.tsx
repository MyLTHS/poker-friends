import { JoinScreen } from "@/rooms/JoinScreen";

export default async function JoinPage({ searchParams }: { searchParams: Promise<{ token?: string }> }) {
  const { token = "" } = await searchParams;
  return <JoinScreen token={token} key={token} />;
}
