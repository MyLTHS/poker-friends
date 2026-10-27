import { describe, expect, it } from "vitest";
import type { HandCompletedMessage, HandStartedMessage, HandView, TableSnapshotMessage } from "@/api/protocol";
import midHandFixture from "../../../docs/api/fixtures/server/valid/table.snapshot.mid-hand.json";
import spectatorFixture from "../../../docs/api/fixtures/server/valid/table.snapshot.spectator.json";
import startedFixture from "../../../docs/api/fixtures/server/valid/hand.started.json";
import sevenDeuceFixture from "../../../docs/api/fixtures/server/valid/hand.completed.seven-deuce.json";
import snapshotFixture from "../../../docs/api/fixtures/server/valid/table.snapshot.between-hands.json";
import { blindSeats, initials, raisePresets, tableView, toClubCard } from "./view";

const started = startedFixture as unknown as HandStartedMessage;

describe("toClubCard", () => {
  it("maps rank and suit to the mockup's card text", () => {
    expect(["Th", "As", "7d", "2c", "Ks"].map(toClubCard)).toEqual(["10♥", "A♠", "7♦", "2♣", "K♠"]);
    expect(toClubCard("??")).toBe("??");
  });
});

describe("initials", () => {
  it("takes two letters, in Vietnamese upper case", () => {
    expect(initials("Bình")).toBe("BÌ");
    expect(initials("Nguyễn Văn An")).toBe("NA");
  });
});

describe("blindSeats", () => {
  it("puts the blinds on the next two seats after the button", () => {
    expect(blindSeats(started.payload.hand)).toEqual({ sb: 3, bb: 5 });
  });
  it("heads-up: the button is the small blind", () => {
    const hand: HandView = { ...started.payload.hand, button_seat: 5, players: [started.payload.hand.players[0], started.payload.hand.players[2]] };
    expect(blindSeats(hand)).toEqual({ sb: 5, bb: 1 });
  });
});

describe("tableView", () => {
  it("shows only the receiver's own hole cards and backs for the others", () => {
    const table = (midHandFixture as unknown as TableSnapshotMessage).payload.table;
    const view = tableView(table);
    const me = view.players[table.you.seat! - 1];
    expect(me.cards?.every((c) => c !== "??")).toBe(true);
    const others = view.players.filter((p, i) => i !== table.you.seat! - 1 && p.state !== "empty");
    expect(others.every((p) => p.cards === undefined)).toBe(true);
    expect(view.players).toHaveLength(table.room.max_seats);
  });

  it("once the hand is over, seats show the room balance after the 7-2 bonus", () => {
    const completed = sevenDeuceFixture as unknown as HandCompletedMessage;
    const base = (snapshotFixture as unknown as TableSnapshotMessage).payload.table;
    const seats = base.seats.map((s) => ({ ...s, stack: completed.payload.results.find((r) => r.player_id === s.player_id)!.stack }));
    const view = tableView({ ...base, seats, hand: completed.payload.hand });
    expect(view.players[0].stack).toBe(1135);
  });

  it("a spectator has no hero seat", () => {
    const view = tableView((spectatorFixture as unknown as TableSnapshotMessage).payload.table);
    expect(view.heroIndex).toBe(-1);
    expect(view.players.some((p) => p.cards && p.cards.length > 0)).toBe(false);
  });
});

describe("raisePresets", () => {
  it("stays inside min_raise_to..max_raise_to and ends with all-in", () => {
    const hand = started.payload.hand;
    const presets = raisePresets(hand, hand.legal_actions!);
    expect(presets.map((p) => p.label)).toEqual(["1/2 POT", "3/4 POT", "POT", "ALL-IN"]);
    for (const p of presets) {
      expect(p.value).toBeGreaterThanOrEqual(hand.legal_actions!.min_raise_to!);
      expect(p.value).toBeLessThanOrEqual(hand.legal_actions!.max_raise_to!);
    }
    expect(presets[3].value).toBe(1000);
  });
});
