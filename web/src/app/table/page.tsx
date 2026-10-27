import { TableScreen } from "@/table/TableScreen";

const DEFAULT_WS = process.env.NEXT_PUBLIC_TABLE_WS_URL ?? "ws://localhost:8765/ws/rooms/1/";

export default async function TablePage({ searchParams }: { searchParams: Promise<{ player?: string }> }) {
  const { player } = await searchParams;
  const url = player && /^\d+$/.test(player) ? `${DEFAULT_WS}?player=${player}` : DEFAULT_WS;
  return <TableScreen url={url} key={url} />;
}
