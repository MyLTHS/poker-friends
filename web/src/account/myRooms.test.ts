import { describe, expect, it } from "vitest";

import type { components } from "@/api/rest";

import { loadMyRooms, summarizeMyRooms } from "./myRooms";

type LobbyRoom = components["schemas"]["LobbyRoom"];
type RoomSummary = components["schemas"]["RoomSummary"];

const room = (room_id: number, name: string, owner_name: string | null = null): LobbyRoom => ({
  room: {
    room_id,
    name,
    status: "open",
    max_seats: 9,
    small_blind: 5,
    big_blind: 10,
    think_time_seconds: 30,
    seven_deuce_bonus: 0,
    starting_stack: 1000,
    ante: 0,
    bomb_pot_every: 0,
    bomb_pot_amount: 0,
  },
  is_private: false,
  owner_name,
  seated: 2,
});

const summary = (rows: { id: number; balance: number; net: number; hands: number }[]): RoomSummary => ({
  players: rows.map((r) => ({
    player_id: String(r.id),
    display_name: `p${r.id}`,
    granted: r.balance - r.net,
    hands_net: r.net,
    seven_deuce_net: 0,
    balance: r.balance,
    net: r.net,
    hands_played: r.hands,
  })),
});

const me = { id: 7, username: "Lym" };

describe("summarizeMyRooms", () => {
  it("keeps the rooms where I still have chips, most chips first", () => {
    const lobby = [room(1, "Bàn nhỏ"), room(2, "Bàn lớn", "Lym"), room(3, "Bàn lạ")];
    const summaries = new Map([
      [1, summary([{ id: 7, balance: 450, net: -50, hands: 12 }])],
      [2, summary([{ id: 7, balance: 1240, net: 240, hands: 26 }, { id: 8, balance: 900, net: -100, hands: 26 }])],
      [3, summary([{ id: 8, balance: 1000, net: 0, hands: 3 }])],
    ]);
    const mine = summarizeMyRooms(lobby, summaries, me);
    expect(mine.rooms.map((r) => r.name)).toEqual(["Bàn lớn", "Bàn nhỏ"]);
    expect(mine.chips).toBe(1690);
    expect(mine.totalNet).toBe(190);
    expect(mine.handsPlayed).toBe(38);
    expect(mine.owned).toBe(1);
  });

  it("counts hands in a room I lost everything in, but does not list that room", () => {
    const mine = summarizeMyRooms(
      [room(1, "Bàn cháy túi")],
      new Map([[1, summary([{ id: 7, balance: 0, net: -500, hands: 9 }])]]),
      me,
    );
    expect(mine.rooms).toEqual([]);
    expect(mine.handsPlayed).toBe(9);
    expect(mine.totalNet).toBe(0);
  });

  it("is empty with no rooms or no summaries", () => {
    expect(summarizeMyRooms([], new Map(), me)).toEqual({ rooms: [], totalNet: 0, chips: 0, handsPlayed: 0, owned: 0 });
    expect(summarizeMyRooms([room(1, "Bàn")], new Map(), me).rooms).toEqual([]);
  });
});

describe("loadMyRooms", () => {
  it("reads the lobby, then each room's summary, skipping a summary that fails", async () => {
    const asked: string[] = [];
    const request = async <T>(_method: string, url: string) => {
      asked.push(url);
      if (url === "/api/rooms/") return { ok: true as const, data: { rooms: [room(1, "A"), room(2, "B")] } as T };
      if (url === "/api/rooms/1/summary/") {
        return { ok: true as const, data: summary([{ id: 7, balance: 300, net: 100, hands: 4 }]) as T };
      }
      return { ok: false as const, error: { code: "room_not_found" as const, message: "" } };
    };
    const result = await loadMyRooms(me, request as never);
    expect(asked).toEqual(["/api/rooms/", "/api/rooms/1/summary/", "/api/rooms/2/summary/"]);
    expect(result.ok && result.data.rooms.map((r) => r.name)).toEqual(["A"]);
  });

  it("fails when the lobby fails", async () => {
    const request = async () => ({ ok: false as const, error: { code: "network_error" as const, message: "x" } });
    const result = await loadMyRooms(me, request as never);
    expect(result.ok).toBe(false);
  });
});
