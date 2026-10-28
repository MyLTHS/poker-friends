// "Rooms I have chips in", for the profile and the guest upgrade. The API has no such endpoint yet
// (docs/plans/c4-tai-khoan.md), so it is put together here: the lobby lists the rooms this player
// can see, each room's summary has this player's balance. Fine at the club's size (a few rooms).

import type { components } from "@/api/rest";

import { makeRequest, type Result } from "./api";

type Schemas = components["schemas"];
type LobbyRoom = Schemas["LobbyRoom"];
type RoomSummary = Schemas["RoomSummary"];

export type MyRoom = { roomId: number; name: string; balance: number; net: number };
export type MyRooms = {
  /** rooms where this player still has chips, most chips first */
  rooms: MyRoom[];
  /** sum of `net` over `rooms` */
  totalNet: number;
  /** sum of `balance` over `rooms` */
  chips: number;
  /** hands played in every visible room, chips left or not */
  handsPlayed: number;
  /** open rooms this player owns */
  owned: number;
};

/** At most this many room summaries are fetched for one profile. */
export const MAX_ROOMS = 30;

export function summarizeMyRooms(
  lobby: LobbyRoom[],
  summaries: Map<number, RoomSummary>,
  me: { id: number; username: string },
): MyRooms {
  const playerId = String(me.id);
  const rooms: MyRoom[] = [];
  let handsPlayed = 0;
  for (const entry of lobby) {
    const row = summaries.get(entry.room.room_id)?.players.find((p) => p.player_id === playerId);
    if (!row) continue;
    handsPlayed += row.hands_played;
    if (row.balance > 0) rooms.push({ roomId: entry.room.room_id, name: entry.room.name, balance: row.balance, net: row.net });
  }
  rooms.sort((a, b) => b.balance - a.balance || a.name.localeCompare(b.name, "vi"));
  return {
    rooms,
    totalNet: rooms.reduce((sum, r) => sum + r.net, 0),
    chips: rooms.reduce((sum, r) => sum + r.balance, 0),
    handsPlayed,
    owned: lobby.filter((entry) => entry.owner_name === me.username).length,
  };
}

/** Lobby, then every visible room's summary in parallel. A room whose summary fails is skipped. */
export async function loadMyRooms(
  me: { id: number; username: string },
  request = makeRequest(),
): Promise<Result<MyRooms>> {
  const lobby = await request<Schemas["Lobby"]>("GET", "/api/rooms/");
  if (!lobby.ok) return lobby;
  const rooms = lobby.data.rooms.slice(0, MAX_ROOMS);
  const results = await Promise.all(
    rooms.map((entry) => request<RoomSummary>("GET", `/api/rooms/${entry.room.room_id}/summary/`)),
  );
  const summaries = new Map<number, RoomSummary>();
  results.forEach((result, i) => {
    if (result.ok) summaries.set(rooms[i].room.room_id, result.data);
  });
  return { ok: true, data: summarizeMyRooms(rooms, summaries, me) };
}
