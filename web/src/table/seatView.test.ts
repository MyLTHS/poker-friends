import { describe, expect, it } from "vitest";

import type { HandStartedMessage, HandView, TableSnapshotMessage, TableState } from "@/api/protocol";
import betweenFixture from "../../../docs/api/fixtures/server/valid/table.snapshot.between-hands.json";
import midHandFixture from "../../../docs/api/fixtures/server/valid/table.snapshot.mid-hand.json";
import spectatorFixture from "../../../docs/api/fixtures/server/valid/table.snapshot.spectator.json";
import startedFixture from "../../../docs/api/fixtures/server/valid/hand.started.json";

import { GEO, SPOTS_FOR, dealerPos, fitScale, spotOf, spotPos } from "./geometry";
import { actionLabel, blindSeats, dealOrder, raisePresets, showdownOrder, tableView } from "./seatView";

const midHand = (midHandFixture as unknown as TableSnapshotMessage).payload.table;
const spectator = (spectatorFixture as unknown as TableSnapshotMessage).payload.table;
const between = (betweenFixture as unknown as TableSnapshotMessage).payload.table;
const started = (startedFixture as unknown as HandStartedMessage).payload.hand;

describe("geometry", () => {
  it("has one distinct spot per seat for every room size, mine at the bottom", () => {
    for (let n = 2; n <= 9; n++) {
      expect(SPOTS_FOR[n]).toHaveLength(n);
      expect(new Set(SPOTS_FOR[n]).size).toBe(n);
      expect(SPOTS_FOR[n][0]).toBe(1);
    }
  });

  it("rotates the room so my seat is at spot 1, seats going clockwise", () => {
    expect(spotOf(5, 9, 5)).toBe(1);
    expect(spotOf(6, 9, 5)).toBe(2);
    expect(spotOf(4, 9, 5)).toBe(9);
    expect(spotOf(2, 6, 1)).toBe(3);
    expect(spotOf(1, 2, 2)).toBe(10);
  });

  it("never puts two seats on one spot, whatever the room size and my seat", () => {
    for (let n = 2; n <= 9; n++) {
      for (let anchor = 1; anchor <= n; anchor++) {
        const spots = Array.from({ length: n }, (_, i) => spotOf(i + 1, n, anchor));
        expect(new Set(spots).size, `${n} seats, me at ${anchor}`).toBe(n);
        expect(spotOf(anchor, n, anchor)).toBe(1);
      }
    }
  });

  it("keeps every seat inside the frame (phone: clear of the 44px notch inset and the home bar)", () => {
    // Seat box around its avatar centre, measured in the browser: avatar above, plate and tag below.
    const box = { desktop: { dx: 64, up: 40, down: 134, left: 0 }, mobile: { dx: 37, up: 18, down: 73, left: 44 } };
    const bottom = { desktop: 720, mobile: 390 - 20 };
    for (const device of ["desktop", "mobile"] as const) {
      const b = box[device];
      for (const spot of [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]) {
        const p = spotPos(device, spot);
        expect(p.x - b.dx, `${device} spot ${spot} left`).toBeGreaterThanOrEqual(b.left);
        expect(p.x + b.dx, `${device} spot ${spot} right`).toBeLessThanOrEqual(GEO[device].w);
        expect(p.y - b.up, `${device} spot ${spot} top`).toBeGreaterThanOrEqual(0);
        expect(p.y + b.down, `${device} spot ${spot} bottom`).toBeLessThanOrEqual(bottom[device]);
      }
    }
  });

  it("places the dealer button on whole pixels (same in Node and the browser)", () => {
    for (let spot = 1; spot <= 10; spot++) {
      const p = dealerPos("desktop", spot);
      expect(Number.isInteger(p.x) && Number.isInteger(p.y)).toBe(true);
    }
  });

  it("scales the stage to fit, design size at 1100×720", () => {
    expect(fitScale("desktop", { width: 1100, height: 720 })).toBe(1);
    expect(fitScale("desktop", { width: 550, height: 720 })).toBe(0.5);
    expect(fitScale("mobile", { width: 612, height: 390 })).toBe(1);
  });
});

describe("tableView", () => {
  it("draws only my own hole cards face up, backs for the others", () => {
    const view = tableView(midHand);
    const me = view.seats.find((s) => s.isMe)!;
    expect(me.seat).toBe(5);
    expect(me.spot).toBe(1);
    expect(me.cards?.every((c) => c !== "??")).toBe(true);
    for (const s of view.seats.filter((s) => !s.isMe && s.state !== "empty")) {
      expect(s.cards?.every((c) => c === "??")).toBe(true);
      expect(s.shown).toBe(false);
    }
  });

  it("marks the actor, a lost connection and empty seats", () => {
    const view = tableView(midHand);
    const actor = view.seats.find((s) => s.playerId === midHand.hand!.actor)!;
    expect(actor.state).toBe("turn");
    const an = view.seats.find((s) => s.name === "An")!;
    expect(an.offline).toBe(true);
    expect(view.seats.filter((s) => s.state === "empty")).toHaveLength(6);
  });

  it("shows a spectator no 'me' and keeps seat 1 at the bottom", () => {
    const view = tableView(spectator);
    expect(view.mySeat).toBeNull();
    expect(view.seats.some((s) => s.isMe)).toBe(false);
    expect(view.seats.find((s) => s.seat === 1)!.spot).toBe(1);
    expect(view.seats.flatMap((s) => s.cards ?? []).every((c) => c === "??")).toBe(true);
  });

  it("derives folded, all-in, sitting out and the button", () => {
    const hand: HandView = {
      ...midHand.hand!,
      actor: null,
      players: [
        { ...midHand.hand!.players[0], in_hand: false, cards: [] },
        { ...midHand.hand!.players[1], in_hand: true, stack: 0, bet: 990 },
        midHand.hand!.players[2],
      ],
    };
    const table: TableState = { ...midHand, hand, seats: midHand.seats.map((s) => (s.seat === 5 ? { ...s, sitting_out: true } : s)) };
    const view = tableView(table);
    const bySeat = (seat: number) => view.seats.find((s) => s.seat === seat)!;
    expect(bySeat(1).state).toBe("folded");
    expect(bySeat(1).isButton).toBe(true);
    expect(bySeat(3).state).toBe("disconnected");
    expect(bySeat(5).state).toBe("sitting-out");
  });

  it("after the hand: winners, deltas with the 7-2 bonus, no bets", () => {
    const hand = { ...midHand.hand!, complete: true, actor: null, legal_actions: null };
    const view = tableView({ ...midHand, hand }, {
      results: [
        { player_id: "1", seat: 1, hand_net: 35, seven_deuce_net: 100, stack: 1135 },
        { player_id: "3", seat: 5, hand_net: -30, seven_deuce_net: -50, stack: 920 },
      ],
    });
    const lym = view.seats.find((s) => s.name === "Lym")!;
    expect(lym.state).toBe("winner");
    expect(lym.delta).toEqual({ text: "+135", kind: "gain" });
    expect(view.seats.find((s) => s.isMe)!.delta).toEqual({ text: "−80", kind: "loss" });
    expect(view.bets).toBe(0);
  });

  it("after a showdown: the hand's name by the seat and its board cards lit", () => {
    const board = ["Qh", "7d", "3c", "Jh", "6h"];
    const hand = { ...midHand.hand!, board, complete: true, actor: null, legal_actions: null };
    const view = tableView({ ...midHand, hand }, {
      showdown: [{ player_id: "2", seat: 3, category: "one_pair", cards: ["Ac", "Ad", "Qh", "Jh", "7d"] }],
    });
    expect(view.seats.find((s) => s.seat === 3)!.hand).toBe("Đôi A");
    expect(view.seats.filter((s) => s.hand)).toHaveLength(1);
    expect(view.boardHi).toEqual([0, 1, 3]);
  });

  it("lights only the board cards of the winner's hand, not of a shown loser", () => {
    const board = ["Qh", "7d", "3c", "Jh", "6h"];
    const hand = { ...midHand.hand!, board, complete: true, actor: null, legal_actions: null };
    const view = tableView({ ...midHand, hand }, {
      showdown: [
        { player_id: "1", seat: 1, category: "one_pair", cards: ["Ac", "Ad", "Qh", "Jh", "7d"] },
        { player_id: "3", seat: 5, category: "one_pair", cards: ["6c", "6h", "Qh", "Jh", "7d"] }, // uses the board's 6h
      ],
      results: [
        { player_id: "1", seat: 1, hand_net: 30, seven_deuce_net: 0, stack: 1030 },
        { player_id: "3", seat: 5, hand_net: -30, seven_deuce_net: 0, stack: 970 },
      ],
    });
    expect(view.boardHi).toEqual([0, 1, 3]);
  });

  it("names no hand while the hand runs", () => {
    const view = tableView(midHand, {
      showdown: [{ player_id: "2", seat: 3, category: "one_pair", cards: ["Ac", "Ad", "Qh", "Jh", "7d"] }],
    });
    expect(view.seats.some((s) => s.hand)).toBe(false);
    expect(view.boardHi).toEqual([]);
  });

  it("between hands everyone waits with their room balance", () => {
    const view = tableView(between);
    expect(view.board).toEqual([]);
    expect(view.seats.filter((s) => s.state !== "empty").every((s) => s.state === "waiting")).toBe(true);
  });
});

describe("hand order", () => {
  it("blinds and dealing start left of the button", () => {
    expect(blindSeats(started)).toEqual({ sb: 3, bb: 5 });
    expect(dealOrder(started)).toEqual([3, 5, 1]);
    expect(showdownOrder(started)).toEqual([3, 5, 1]);
  });

  it("heads-up the button is the small blind and is dealt first", () => {
    const hand: HandView = { ...started, button_seat: 5, players: [started.players[0], started.players[2]] };
    expect(blindSeats(hand)).toEqual({ sb: 5, bb: 1 });
    expect(dealOrder(hand)).toEqual([5, 1]);
  });
});

describe("labels and presets", () => {
  it("names actions like the design", () => {
    const p = started.players[1];
    expect(actionLabel({ player_id: "2", seat: 3, kind: "call", amount: null, timeout: false }, { ...p, bet: 40 })).toBe("Theo 40");
    expect(actionLabel({ player_id: "2", seat: 3, kind: "raise", amount: 1200, timeout: false }, { ...p, bet: 1200, stack: 1000 })).toBe("Tố 1.200");
    expect(actionLabel({ player_id: "2", seat: 3, kind: "raise", amount: 995, timeout: false }, { ...p, bet: 995, stack: 0 })).toBe("All-in 995");
    expect(actionLabel({ player_id: "2", seat: 3, kind: "fold", amount: null, timeout: true }, p)).toBe("Hết giờ · bỏ");
  });

  it("clamps ½ pot, ¾ pot, pot and all-in into the server's raise range", () => {
    const presets = raisePresets(started, started.legal_actions!);
    expect(presets.map((p) => p.label)).toEqual(["½ pot", "¾ pot", "Pot", "All-in"]);
    for (const p of presets) {
      expect(p.amount).toBeGreaterThanOrEqual(started.legal_actions!.min_raise_to!);
      expect(p.amount).toBeLessThanOrEqual(started.legal_actions!.max_raise_to!);
    }
    expect(presets.at(-1)!.amount).toBe(1000);
  });
});
