import { describe, expect, it } from "vitest";

import { DEFAULT_PREFS, readPrefs, recipe, soundsForCues, writePrefs, type SoundName } from "./sound";

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

describe("sound prefs", () => {
  it("are off by default and survive a round trip", () => {
    const store = memory();
    expect(readPrefs(store)).toEqual(DEFAULT_PREFS);
    expect(DEFAULT_PREFS.on).toBe(false);
    writePrefs({ on: true, volume: 0.7 }, store);
    expect(readPrefs(store)).toEqual({ on: true, volume: 0.7 });
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
  });

  it("jingles brighter when I take the pot", () => {
    const award = { kind: "award" as const, pots: [{ winners: [{ seat: 4, amount: 300 }] }] };
    expect(soundsForCues([award], 4)).toEqual([{ name: "win" }]);
    expect(soundsForCues([award], 2)).toEqual([{ name: "pot" }]);
    expect(soundsForCues([award], null)).toEqual([{ name: "pot" }]);
  });

  it("lets the 7-2 fanfare carry the pot alone; bets and folds stay quiet", () => {
    const cues = [
      { kind: "collect" as const, bets: [{ seat: 1, amount: 20 }] },
      { kind: "award" as const, pots: [{ winners: [{ seat: 1, amount: 60 }] }] },
      { kind: "seven" as const, seat: 1 },
    ];
    expect(soundsForCues(cues, 1)).toEqual([{ name: "seven" }]);
    expect(soundsForCues([{ kind: "bet", seat: 2 }, { kind: "fold", seat: 3 }], 2)).toEqual([]);
  });
});

describe("recipe", () => {
  it("gives every sound short, quiet voices", () => {
    for (const name of ["deal", "turn", "hurry", "pot", "win", "seven"] satisfies SoundName[]) {
      const voices = recipe(name, 4);
      expect(voices.length).toBeGreaterThan(0);
      for (const v of voices) {
        expect(v.gain).toBeGreaterThan(0);
        expect(v.gain).toBeLessThanOrEqual(0.5);
        expect(v.at + v.dur).toBeLessThan(2);
      }
    }
    expect(recipe("deal", 6)).toHaveLength(6);
  });
});
