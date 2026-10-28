import jsQR from "jsqr";
import { describe, expect, it } from "vitest";

import type { LobbyRoom } from "./api";
import { clock, ledgerTotals, netBarWidth, withPlayer, type HandSummary, type SummaryRow } from "./history";
import { filterCount, filterRooms, fold, inviteToken, roomCta } from "./lobby";
import { qrModules } from "./qr";
import { changedRules, checkRules, DEFAULT_RULES, fieldText, pendingText, rulesLine, serverFieldErrors, type RoomInfo } from "./rules";

const info = (over: Partial<RoomInfo> = {}): RoomInfo => ({
  room_id: 1,
  name: "Bàn thứ Sáu",
  status: "open",
  max_seats: 9,
  small_blind: 10,
  big_blind: 20,
  think_time_seconds: 20,
  seven_deuce_bonus: 50,
  ...over,
});
const row = (over: Partial<Omit<LobbyRoom, "room">> & { room?: Partial<RoomInfo> } = {}): LobbyRoom => ({
  is_private: false,
  owner_name: "An",
  seated: 3,
  ...over,
  room: info(over.room),
});

describe("lobby", () => {
  const rows = [
    row({ room: { room_id: 1, name: "Bàn thứ Sáu" }, owner_name: "An" }),
    row({ room: { room_id: 2, name: "Đêm muộn", max_seats: 2 }, owner_name: "Lym", is_private: true, seated: 2 }),
    row({ room: { room_id: 3, name: "Tập chơi", status: "closed" }, owner_name: "Bình", seated: 0 }),
  ];

  it("searches room and owner names without accents or case", () => {
    expect(fold("Đêm Muộn")).toBe("dem muon");
    expect(filterRooms(rows, { query: "ban thu", filter: "all", myName: null }).map((r) => r.room.room_id)).toEqual([1]);
    expect(filterRooms(rows, { query: "binh", filter: "all", myName: null }).map((r) => r.room.room_id)).toEqual([3]);
  });

  it("filters public, mine and rooms with a free seat", () => {
    const ids = (filter: "all" | "public" | "mine" | "open") => filterRooms(rows, { query: "", filter, myName: "Lym" }).map((r) => r.room.room_id);
    expect(ids("public")).toEqual([1, 3]);
    expect(ids("mine")).toEqual([2]);
    expect(ids("all")).toEqual([2, 1, 3]);
    expect(ids("open")).toEqual([1]);
    expect(filterCount(rows, "mine", null)).toBe(0);
  });

  it("words the call to action from the seats", () => {
    expect(roomCta(rows[1], "Lym").label).toBe("Về bàn");
    expect(roomCta(rows[1], "An")).toMatchObject({ label: "Vào xem", watch: true });
    expect(roomCta(row({ seated: 0 }), null).label).toBe("Ngồi đầu tiên");
    expect(roomCta(row({ seated: 7 }), null)).toMatchObject({ label: "Ngồi vào", note: "Còn 2 ghế" });
    expect(roomCta(rows[2], null).note).toBe("Phòng đã đóng");
  });

  it("finds the invite token in a pasted link or the token alone", () => {
    expect(inviteToken(" https://poker.example/rooms/join?token=Ab_c-123456789 ")).toBe("Ab_c-123456789");
    expect(inviteToken("localhost:3000/rooms/join?x=1&token=abc%2Ddef#top")).toBe("abc-def");
    expect(inviteToken("Ab_c-123456789")).toBe("Ab_c-123456789");
    expect(inviteToken("bàn thứ sáu")).toBeNull();
    expect(inviteToken("/rooms/join?token=%E0%A4%A")).toBeNull();
    expect(inviteToken("")).toBeNull();
  });
});

describe("rules", () => {
  it("checks the server's limits before sending", () => {
    expect(checkRules({ ...DEFAULT_RULES, name: "Bàn" })).toEqual({});
    expect(checkRules({ ...DEFAULT_RULES, name: " " }).name).toBeTruthy();
    expect(checkRules({ ...DEFAULT_RULES, name: "x", small_blind: 20, big_blind: 20 }).small_blind).toBe("Blind nhỏ phải nhỏ hơn blind lớn.");
    expect(checkRules({ ...DEFAULT_RULES, name: "x", think_time_seconds: 4 }).think_time_seconds).toBe("Từ 5 đến 120 giây.");
    expect(checkRules({ ...DEFAULT_RULES, name: "x", seven_deuce_bonus: 2.5 }).seven_deuce_bonus).toBeTruthy();
  });

  it("puts the server's English field errors in Vietnamese", () => {
    expect(fieldText("Must be between 2 and 9.")).toBe("Từ 2 đến 9.");
    expect(fieldText("Must be between 1 and ∞.")).toBe("Ít nhất là 1.");
    expect(serverFieldErrors({ big_blind: ["Must be between 2 and ∞."] })).toEqual({ big_blind: "Ít nhất là 2.", small_blind: "Ít nhất là 2." });
  });

  it("sends only the changed rules", () => {
    const room = info();
    expect(changedRules(room, { ...room, big_blind: 40, small_blind: 20 })).toEqual({ small_blind: 20, big_blind: 40 });
    expect(changedRules(room, room)).toEqual({});
  });

  it("describes the rules and the change waiting for the next hand", () => {
    expect(rulesLine({ ...DEFAULT_RULES })).toBe("10/20 · 9 ghế · 20s · 7-2: 50 · Riêng");
    expect(pendingText({ big_blind: 40, think_time_seconds: 15 }, info())).toBe("Ván sau: blind 10/40 · 15 giây");
    expect(pendingText(null, info())).toBeNull();
  });
});

describe("history", () => {
  const rows = [
    { player_id: "1", display_name: "Lym", granted: 2000, hands_net: 1130, seven_deuce_net: 100, balance: 3230, net: 1230, hands_played: 38 },
    { player_id: "2", display_name: "An", granted: 2000, hands_net: -1230, seven_deuce_net: 0, balance: 770, net: -1230, hands_played: 38 },
  ] satisfies SummaryRow[];

  it("adds up the ledger and checks it nets to zero", () => {
    expect(ledgerTotals(rows)).toEqual({ granted: 4000, balance: 4000, net: 0, balanced: true });
    expect(netBarWidth(-1230, rows)).toBe(50);
    expect(netBarWidth(0, [{ net: 0 }])).toBe(0);
  });

  it("keeps the hands a player was in", () => {
    const hand = (id: number, players: string[]): HandSummary => ({
      hand_id: id,
      hand_no: id,
      completed_at: "2026-10-28T14:04:00Z",
      voided: false,
      players: players.map((p) => ({ player_id: p, display_name: p, seat: 1, net: 0 })),
    });
    expect(withPlayer([hand(1, ["1", "2"]), hand(2, ["2"])], "1").map((h) => h.hand_id)).toEqual([1]);
    expect(withPlayer([hand(1, ["1"])], null)).toEqual([]);
    expect(clock("2026-10-28T14:04:00Z")).toMatch(/^\d{2}:04$/);
  });
});

describe("qrModules", () => {
  it("encodes the link so a phone reads it back, even with the centre covered", () => {
    const link = "https://poker-friends.example/rooms/join?token=Q2xxS0f4dkJhcnNlY3JldHRva2VuMjQ";
    const modules = qrModules(link);
    const n = modules.length;
    // The same hole as @/ui QR draws for its spade.
    const hole = Math.max(3, Math.round(n / 5) | 1);
    const at = (n - hole) / 2;
    const scale = 6;
    const quiet = 2; // the frame @/ui QR draws (viewBox -2 … n + 4): a thinner quiet zone than the standard 4
    const size = (n + quiet * 2) * scale;
    const pixels = new Uint8ClampedArray(size * size * 4).fill(255);
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const r = Math.floor(y / scale) - quiet;
        const c = Math.floor(x / scale) - quiet;
        const inHole = r >= at && r < at + hole && c >= at && c < at + hole;
        if (r >= 0 && c >= 0 && r < n && c < n && modules[r][c] && !inHole) pixels.fill(0, (y * size + x) * 4, (y * size + x) * 4 + 3);
      }
    }
    expect(jsQR(pixels, size, size)?.data).toBe(link);
  });
});
