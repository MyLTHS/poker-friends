import { TableScreen } from "@/table/TableScreen";
import { d1Viewport } from "@/ui/viewport";

// D1 table: landscape phones draw under the notch, the page keeps its own insets (ui/viewport.ts).
export const viewport = d1Viewport;

const DEFAULT_WS = process.env.NEXT_PUBLIC_TABLE_WS_URL ?? "ws://localhost:8765/ws/rooms/1/";

export default async function TablePage({ searchParams }: { searchParams: Promise<{ player?: string }> }) {
  const { player } = await searchParams;
  const url = player && /^\d+$/.test(player) ? `${DEFAULT_WS}?player=${player}` : DEFAULT_WS;
  return <TableScreen url={url} key={url} />;
}
