import { describe, expect, it } from "vitest";

import type { CueBody, Move } from "./cues";
import { betChips, DEFAULT_PREFS, readPrefs, recipe, soundsForCues, writePrefs, type SoundName } from "./sound";

function memory(): Storage {
  const data = new Map<string, string>();
  return {
    get length() {
      return data.size;
    },
    clear: () => data.clear(),
    getItem: (k) => data.get(k) ?? null,
    key: (i) => [...data.keys()][i] ?? null,
    removeItem: (k) => void data.delete(k),
    setItem: (k, v) => void data.set(k, v),
  };
}

const throwing = {
  getItem: () => {
    throw new Error("SecurityError");
  },
  setItem: () => {
    throw new Error("QuotaExceededError");
  },
} as unknown as Storage;

const act = (move: Move, put = 0, pot = 30, timeout = false): CueBody => ({ kind: "act", seat: 2, move, put, pot, timeout });

const ALL: SoundName[] = ["deal", "flip", "check", "call", "bet", "raise", "allin", "fold", "collect", "turn", "hurry", "pot", "win", "big", "seven"];

describe("sound prefs", () => {
  it("are on by default and survive a round trip", () => {
    const store = memory();
    expect(DEFAULT_PREFS).toEqual({ on: true, volume: 0.35 });
    expect(readPrefs(store)).toEqual(DEFAULT_PREFS);
    writePrefs({ on: true, volume: 0.7 }, store);
    expect(readPrefs(store)).toEqual({ on: true, volume: 0.7 });
  });

  it("keep a stored off switched off", () => {
    const store = memory();
    writePrefs({ on: false, volume: 0.15 }, store);
    expect(readPrefs(store)).toEqual({ on: false, volume: 0.15 });
    store.setItem("pf.table.sound", JSON.stringify({ on: false }));
    expect(readPrefs(store)).toEqual({ on: false, volume: 0.35 });
  });

  it("fall back to the default on junk or blocked storage", () => {
    const store = memory();
    store.setItem("pf.table.sound", "{nope");
    expect(readPrefs(store)).toEqual(DEFAULT_PREFS);
    store.setItem("pf.table.sound", JSON.stringify({ on: "yes", volume: 9 }));
    expect(readPrefs(store)).toEqual(DEFAULT_PREFS);
    expect(readPrefs(throwing)).toEqual(DEFAULT_PREFS);
    expect(() => writePrefs({ on: true, volume: 0.15 }, throwing)).not.toThrow();
    expect(readPrefs(null)).toEqual(DEFAULT_PREFS);
  });
});

describe("soundsForCues", () => {
  it("flicks once per card dealt, capped", () => {
    expect(soundsForCues([{ kind: "deal", order: [3, 5, 1] }], 3)).toEqual([{ name: "deal", count: 6 }]);
    expect(soundsForCues([{ kind: "deal", order: [1, 2, 3, 4, 5, 6, 7, 8, 9] }], null)[0].count).toBe(12);
    expect(soundsForCues([{ kind: "board", from: 0, to: 3 }], 2)).toEqual([{ name: "deal", count: 3 }]);
  });

  it("gives every move its own sound", () => {
    expect(soundsForCues([act("check")], 2)).toEqual([{ name: "check" }]);
    expect(soundsForCues([act("call", 10)], 2)).toEqual([{ name: "call" }]);
    expect(soundsForCues([act("fold")], 2)).toEqual([{ name: "fold" }]);
    expect(soundsForCues([act("allin", 500)], 2)).toEqual([{ name: "allin" }]);
    expect(soundsForCues([act("bet", 30, 30)], 2)).toEqual([{ name: "bet", count: 3 }]);
    expect(soundsForCues([act("raise", 30, 30)], 2)).toEqual([{ name: "raise", count: 3 }]);
  });

  it("stacks more chips the bigger the bet is against the pot, 2 to 6", () => {
    expect(betChips(5, 30)).toBe(2);
    expect(betChips(20, 30)).toBe(2);
    expect(betChips(30, 30)).toBe(3);
    expect(betChips(40, 30)).toBe(4);
    expect(betChips(60, 30)).toBe(6);
    expect(betChips(900, 30)).toBe(6);
    expect(betChips(0, 0)).toBe(2);
    expect(betChips(10, 0)).toBe(6);
    const counts = [10, 30, 50, 70].map((put) => soundsForCues([act("bet", put, 30)], 2)[0].count ?? 0);
    expect(counts).toEqual([...counts].sort((a, b) => a - b));
    expect(counts[0]).toBeLessThan(counts[3]);
  });

  it("plays a timed-out move softly", () => {
    expect(soundsForCues([act("fold", 0, 30, true)], 2)).toEqual([{ name: "fold", soft: true }]);
    expect(soundsForCues([act("check", 0, 30, true)], 2)).toEqual([{ name: "check", soft: true }]);
  });

  it("sounds an action once, from its act cue (its bet and fold cues stay quiet)", () => {
    expect(soundsForCues([act("call", 10), { kind: "bet", seat: 2 }], 2)).toEqual([{ name: "call" }]);
    expect(soundsForCues([act("raise", 60, 30), { kind: "bet", seat: 2 }], 2)).toEqual([{ name: "raise", count: 6 }]);
    expect(soundsForCues([act("fold"), { kind: "fold", seat: 2 }], 2)).toEqual([{ name: "fold" }]);
    expect(soundsForCues([{ kind: "bet", seat: 2 }, { kind: "fold", seat: 3 }], 2)).toEqual([]);
  });

  it("slides chips to the pot when a round closes, in cue order", () => {
    const cues: CueBody[] = [
      act("call", 20),
      { kind: "collect", bets: [{ seat: 1, amount: 20 }, { seat: 2, amount: 20 }, { seat: 3, amount: 20 }] },
      { kind: "board", from: 0, to: 3 },
    ];
    expect(soundsForCues(cues, 2)).toEqual([{ name: "call" }, { name: "collect", count: 3 }, { name: "deal", count: 3 }]);
    expect(soundsForCues([{ kind: "collect", bets: [{ seat: 1, amount: 5 }] }], 2)).toEqual([{ name: "collect", count: 2 }]);
  });

  it("flips each card turned over", () => {
    expect(soundsForCues([{ kind: "showdown", order: [1, 4] }], 2)).toEqual([{ name: "flip", count: 4 }]);
    expect(soundsForCues([{ kind: "showdown", order: [] }], 2)).toEqual([]);
    expect(soundsForCues([{ kind: "reveal", seat: 5 }], 2)).toEqual([{ name: "flip", count: 2 }]);
  });

  it("jingles brighter when I take the pot", () => {
    const award = { kind: "award" as const, pots: [{ winners: [{ seat: 4, amount: 300 }] }] };
    expect(soundsForCues([award], 4)).toEqual([{ name: "win" }]);
    expect(soundsForCues([award], 2)).toEqual([{ name: "pot" }]);
    expect(soundsForCues([award], null)).toEqual([{ name: "pot" }]);
  });

  it("lets the 7-2 fanfare carry the pot alone", () => {
    const cues: CueBody[] = [
      { kind: "collect", bets: [{ seat: 1, amount: 20 }] },
      { kind: "award", pots: [{ winners: [{ seat: 1, amount: 60 }] }] },
      { kind: "seven", seat: 1 },
    ];
    expect(soundsForCues(cues, 1)).toEqual([{ name: "collect", count: 2 }, { name: "seven" }]);
    expect(soundsForCues([{ kind: "big", seat: 4, title: "Cù lũ!" }], 2)).toEqual([{ name: "big" }]);
  });
});

describe("recipe", () => {
  it("gives every sound short, gentle voices", () => {
    for (const name of ALL) {
      for (const count of [1, 4, 12]) {
        for (const soft of [false, true]) {
          const voices = recipe(name, count, soft);
          expect(voices.length).toBeGreaterThan(0);
          for (const v of voices) {
            expect(v.at).toBeGreaterThanOrEqual(0);
            expect(v.dur).toBeGreaterThan(0);
            expect(v.gain).toBeGreaterThan(0);
            expect(v.gain).toBeLessThanOrEqual(0.3);
            expect(v.at + v.dur).toBeLessThan(2);
            if (v.attack !== undefined) expect(v.attack).toBeLessThan(v.dur);
          }
        }
      }
    }
    expect(recipe("deal", 6)).toHaveLength(6);
    expect(recipe("flip", 3).filter((v) => v.at === 0).length).toBeGreaterThan(0);
  });

  it("knocks twice for a check and swishes a fold downward", () => {
    const knocks = new Set(recipe("check").map((v) => v.at));
    expect(knocks.size).toBe(2);
    const [swish] = recipe("fold");
    expect("noise" in swish && swish.to !== undefined && swish.to < swish.noise).toBe(true);
  });

  it("pushes more chips, a little louder, for a bigger bet; a raise more than a bet", () => {
    const peak = (vs: ReturnType<typeof recipe>) => Math.max(...vs.map((v) => v.gain));
    expect(recipe("bet", 6).length).toBeGreaterThan(recipe("bet", 2).length);
    expect(recipe("bet", 9)).toEqual(recipe("bet", 6));
    expect(peak(recipe("bet", 6))).toBeGreaterThan(peak(recipe("bet", 2)));
    expect(recipe("raise", 3).length).toBeGreaterThan(recipe("bet", 3).length);
    expect(peak(recipe("raise", 3))).toBeGreaterThan(peak(recipe("bet", 3)));
  });

  it("opens an all-in with a low hit and a rising sweep", () => {
    const voices = recipe("allin");
    expect(voices.some((v) => "tone" in v && v.at === 0 && v.freq < 120)).toBe(true);
    expect(voices.some((v) => "noise" in v && v.to !== undefined && v.to > v.noise)).toBe(true);
  });

  it("plays the soft take quieter and darker", () => {
    const loud = recipe("call");
    const soft = recipe("call", 1, true);
    expect(soft).toHaveLength(loud.length);
    soft.forEach((v, i) => {
      expect(v.gain).toBeLessThan(loud[i].gain);
      const l = loud[i];
      if ("noise" in v && "noise" in l) expect(v.noise).toBeLessThan(l.noise);
    });
  });
});
