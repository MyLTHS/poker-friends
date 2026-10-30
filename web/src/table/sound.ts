// Table sounds, made on the spot with Web Audio (no sound files, nothing licensed). Each action
// has its own sound: a double knock on the felt for a check, a chip clink for a call, a stack of
// chips pushed out for a bet or raise (more chips, a little brighter, the bigger it is against the
// pot), a drum hit, rising sweep and chips for all-in, and a soft card swish for a fold; an action
// the clock made sounds the same, quieter and duller. Also a card flick per card dealt (hole cards
// and board cards), chips sliding into the pot when a round closes, a card flip per card turned
// over, a soft chime when it becomes my turn, a tick when my clock runs low, chips clinking to the
// pot's winner (a brighter jingle when that is me), a fanfare for a full house or better, and a
// brass fanfare for 7-2. On by default (audio can only start after the first tap or key anyway);
// the choice (on/off + volume) is kept in localStorage, every access guarded (private windows and
// blocked storage throw), and a stored "off" stays off.
import type { CueBody } from "./cues";
import { readJson, writeJson } from "./prefs";

export type SoundName =
  | "deal"
  | "flip"
  | "check"
  | "call"
  | "bet"
  | "raise"
  | "allin"
  | "fold"
  | "collect"
  | "turn"
  | "hurry"
  | "pot"
  | "win"
  | "big"
  | "seven";

export type SoundPrefs = { on: boolean; volume: number };

export const DEFAULT_PREFS: SoundPrefs = { on: true, volume: 0.35 };
/** The three volume steps the settings offer. */
export const VOLUMES = [
  { label: "Nhỏ", value: 0.15 },
  { label: "Vừa", value: 0.35 },
  { label: "To", value: 0.7 },
] as const;

const KEY = "pf.table.sound";

export function readPrefs(store?: Storage | null): SoundPrefs {
  const data = readJson(KEY, store) as Partial<SoundPrefs> | null;
  if (!data || typeof data !== "object") return DEFAULT_PREFS;
  const volume = typeof data.volume === "number" && data.volume > 0 && data.volume <= 1 ? data.volume : DEFAULT_PREFS.volume;
  return { on: typeof data.on === "boolean" ? data.on : DEFAULT_PREFS.on, volume };
}

export function writePrefs(prefs: SoundPrefs, store?: Storage | null): void {
  writeJson(KEY, prefs, store);
}

/** One sound to play: `count` = cards / chips, `soft` = quieter and duller (a timed-out action). */
export type Sound = { name: SoundName; count?: number; soft?: boolean };

const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));

/** Chips in a bet's stack: one per third of the pot it went into, 2 to 6. */
export function betChips(put: number, pot: number): number {
  if (pot <= 0) return put > 0 ? 6 : 2;
  return clamp(Math.round((put * 3) / pot), 2, 6);
}

/** Sounds for the animation cues of one state event, in cue order. `mySeat` = my seat, null
 *  when watching. Actions sound from their "act" cue only (its "bet"/"fold" cues stay quiet). */
export function soundsForCues(cues: CueBody[], mySeat: number | null): Sound[] {
  const out: Sound[] = [];
  for (const cue of cues) {
    if (cue.kind === "act") {
      const soft = cue.timeout ? { soft: true } : {};
      if (cue.move === "bet" || cue.move === "raise") out.push({ name: cue.move, count: betChips(cue.put, cue.pot), ...soft });
      else out.push({ name: cue.move, ...soft });
    } else if (cue.kind === "deal") out.push({ name: "deal", count: Math.min(cue.order.length * 2, 12) });
    else if (cue.kind === "board") out.push({ name: "deal", count: cue.to - cue.from });
    else if (cue.kind === "collect") out.push({ name: "collect", count: clamp(cue.bets.length, 2, 5) });
    else if (cue.kind === "showdown") {
      if (cue.order.length) out.push({ name: "flip", count: Math.min(cue.order.length * 2, 12) });
    } else if (cue.kind === "reveal") out.push({ name: "flip", count: 2 });
    else if (cue.kind === "big") out.push({ name: "big" });
    else if (cue.kind === "award") {
      const mine = mySeat !== null && cue.pots.some((p) => p.winners.some((w) => w.seat === mySeat));
      out.push({ name: mine ? "win" : "pot" });
    } else if (cue.kind === "seven") out.push({ name: "seven" });
  }
  // the 7-2 fanfare carries the pot moment on its own
  return out.some((s) => s.name === "seven") ? out.filter((s) => s.name !== "pot" && s.name !== "win") : out;
}

/* ---------- recipes ---------- */

/** One voice, times in s: a tone (oscillator, optional glide to `to`) or a burst of filtered
 *  noise (band-pass round `noise` Hz, or low-pass under it when `low`; the filter glides to `to`).
 *  `attack` = time to full gain (default 6 ms), for swells and swishes. */
export type Voice =
  | { at: number; dur: number; gain: number; attack?: number; tone: OscillatorType; freq: number; to?: number }
  | { at: number; dur: number; gain: number; attack?: number; noise: number; to?: number; q?: number; low?: boolean };

const note = (n: number) => 440 * 2 ** (n / 12); // semitones from A4

/** One clay chip hitting another: a short bright click with a little ring. */
const click = (at: number, freq: number, gain: number): Voice[] => [
  { at, dur: 0.025, gain, noise: freq * 1.7, q: 4 },
  { at, dur: 0.05, gain: gain * 0.75, tone: "triangle", freq },
];

/** A low knock on the felt: muffled noise and a falling sine. */
const thud = (at: number, gain: number, freq = 120): Voice[] => [
  { at, dur: 0.07, gain, noise: 260, low: true },
  { at, dur: 0.09, gain: gain * 0.8, tone: "sine", freq, to: freq * 0.5 },
];

/** A stack of `n` chips pushed over the felt; `lift` semitones brighter, `gain` per chip. */
const stack = (n: number, lift: number, gain: number): Voice[] => [
  { at: 0, dur: 0.12, gain: 0.09, attack: 0.02, noise: 900, to: 500, low: true },
  ...Array.from({ length: n }, (_, i) => click(0.04 + i * 0.05, note(24 + lift + ((i * 5) % 7)), gain)).flat(),
];

/** Quieter, and the noise darker: an action the clock made. */
const soften = (voices: Voice[]): Voice[] =>
  voices.map((v) => ("noise" in v ? { ...v, gain: v.gain * 0.55, noise: v.noise * 0.6, ...(v.to ? { to: v.to * 0.6 } : {}) } : { ...v, gain: v.gain * 0.55 }));

/** The notes of each sound. `count` = cards (deal, flip) or chips (bet, raise, collect). */
export function recipe(name: SoundName, count = 1, soft = false): Voice[] {
  const voices = build(name, Math.max(1, Math.round(count)));
  return soft ? soften(voices) : voices;
}

function build(name: SoundName, count: number): Voice[] {
  switch (name) {
    case "deal":
      return Array.from({ length: count }, (_, i) => ({ at: i * 0.09, dur: 0.05, gain: 0.3, noise: 2600 + (i % 3) * 400, q: 0.9 }));
    case "flip":
      // a card turned over: a quick rising "fwip" and the snap of it landing face up
      return Array.from({ length: count }, (_, i): Voice[] => [
        { at: i * 0.16, dur: 0.07, gain: 0.2, attack: 0.02, noise: 1600, to: 4200 },
        { at: i * 0.16 + 0.065, dur: 0.025, gain: 0.18, noise: 5200, q: 2 },
      ]).flat();
    case "check":
      return [...thud(0, 0.26), ...thud(0.15, 0.22, 110)];
    case "call":
      return [...click(0, note(27), 0.16), ...click(0.06, note(31), 0.13)];
    case "bet": {
      const n = clamp(count, 2, 6);
      return stack(n, n - 2, 0.1 + n * 0.01);
    }
    case "raise": {
      const n = clamp(count, 2, 6);
      const chips = stack(n, n, 0.13 + n * 0.01);
      // set down hard at the end
      return [...chips, ...thud(0.06 + n * 0.05, 0.22, 140)];
    }
    case "allin":
      return [
        { at: 0, dur: 0.4, gain: 0.3, tone: "sine", freq: 95, to: 42 },
        { at: 0, dur: 0.18, gain: 0.24, noise: 200, low: true },
        { at: 0.06, dur: 0.38, gain: 0.12, attack: 0.3, noise: 500, to: 3600, q: 1.5 },
        { at: 0.06, dur: 0.38, gain: 0.07, attack: 0.3, tone: "triangle", freq: note(-9), to: note(10) },
        ...Array.from({ length: 6 }, (_, i) => click(0.46 + i * 0.045, note(26 + ((i * 5) % 7)), 0.16)).flat(),
      ];
    case "fold":
      return [{ at: 0, dur: 0.24, gain: 0.12, attack: 0.05, noise: 3400, to: 700, q: 0.8 }];
    case "collect":
      // chips sliding into the middle: a soft rush, then a few quiet clicks as they settle
      return [
        { at: 0, dur: 0.26, gain: 0.1, attack: 0.04, noise: 1300, to: 500, low: true },
        ...Array.from({ length: clamp(count, 2, 5) }, (_, i) => click(0.1 + i * 0.04, note(22 + ((i * 3) % 5)), 0.08)).flat(),
      ];
    case "big":
      return [
        ...[0, 4, 7, 12].map((n, i) => ({ at: i * 0.11, dur: 0.22, gain: 0.18, tone: "square" as const, freq: note(n + 3) })),
        ...[3, 7, 10, 15].map((n) => ({ at: 0.46, dur: 1.1, gain: 0.12, tone: "sawtooth" as const, freq: note(n) })),
      ];
    case "turn":
      return [
        { at: 0, dur: 0.35, gain: 0.3, tone: "sine", freq: note(7) }, // E5
        { at: 0.12, dur: 0.5, gain: 0.28, tone: "sine", freq: note(12) }, // A5
      ];
    case "hurry":
      return [0, 0.5, 1].map((at) => ({ at, dur: 0.07, gain: 0.22, tone: "triangle" as const, freq: note(14) }));
    case "pot":
      return [0, 0.06, 0.13, 0.19].map((at, i) => ({ at, dur: 0.09, gain: 0.18, tone: "triangle" as const, freq: note(24 + (i % 2 ? 3 : 0)) }));
    case "win":
      return [
        ...[0, 0.05, 0.11].map((at, i) => ({ at, dur: 0.08, gain: 0.16, tone: "triangle" as const, freq: note(26 + i * 2) })),
        ...[3, 7, 10, 15].map((n, i) => ({ at: 0.18 + i * 0.09, dur: 0.4, gain: 0.22, tone: "sine" as const, freq: note(n) })),
      ];
    case "seven":
      return [
        ...[-2, 2, 5].map((n, i) => ({ at: i * 0.13, dur: 0.18, gain: 0.2, tone: "sawtooth" as const, freq: note(n) })),
        ...[5, 9, 12].map((n) => ({ at: 0.42, dur: 0.9, gain: 0.14, tone: "sawtooth" as const, freq: note(n) })),
        { at: 0.42, dur: 0.6, gain: 0.25, noise: 6000 },
      ];
  }
}

/* ---------- the synth ---------- */

type AudioCtor = typeof AudioContext;

export type Synth = {
  /** `soft` = the quieter, duller take (an action the clock made). */
  play: (name: SoundName, volume: number, count?: number, soft?: boolean) => void;
  /** From a click or key only: makes the AudioContext, or resumes it (browsers start audio only
   *  after a gesture). Until then play() stays silent. */
  wake: () => void;
  /** Leaving the table: give the audio device back. */
  close: () => void;
};

const NOISE_SECONDS = 1;

/** A synth on one AudioContext, made by the first wake(). */
export function createSynth(): Synth {
  let ctx: AudioContext | null = null;
  let noise: AudioBuffer | null = null;
  const context = () => {
    if (ctx) return ctx;
    const Ctor = (window.AudioContext ?? (window as unknown as { webkitAudioContext?: AudioCtor }).webkitAudioContext) as AudioCtor | undefined;
    if (!Ctor) return null;
    ctx = new Ctor();
    return ctx;
  };
  const noiseBuffer = (c: AudioContext) => {
    if (noise) return noise;
    noise = c.createBuffer(1, Math.round(c.sampleRate * NOISE_SECONDS), c.sampleRate);
    const data = noise.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    return noise;
  };
  return {
    wake() {
      const c = context();
      if (c && c.state === "suspended") void c.resume();
    },
    close() {
      if (ctx && ctx.state !== "closed") void ctx.close();
      ctx = null;
      noise = null;
    },
    play(name, volume, count, soft) {
      // never made or not yet allowed to run: nothing to hear, and no autoplay warning
      const c = ctx;
      if (!c || c.state !== "running" || volume <= 0) return;
      const out = c.createGain();
      out.gain.value = volume;
      out.connect(c.destination);
      const t0 = c.currentTime + 0.01;
      let end = 0;
      for (const v of recipe(name, count, soft)) {
        const start = t0 + v.at;
        const stop = start + v.dur;
        const env = c.createGain();
        env.gain.setValueAtTime(0.0001, start);
        env.gain.exponentialRampToValueAtTime(v.gain, start + Math.min(v.attack ?? 0.006, v.dur * 0.8));
        env.gain.exponentialRampToValueAtTime(0.0001, stop);
        env.connect(out);
        if ("noise" in v) {
          const b = c.createBufferSource();
          b.buffer = noiseBuffer(c);
          const filter = c.createBiquadFilter();
          filter.type = v.low ? "lowpass" : "bandpass";
          filter.frequency.setValueAtTime(v.noise, start);
          if (v.to) filter.frequency.exponentialRampToValueAtTime(v.to, stop);
          filter.Q.value = v.q ?? (v.low ? 0.7 : 1.2);
          b.connect(filter).connect(env);
          // start somewhere in the buffer so repeated clicks do not sound identical
          b.start(start, Math.random() * Math.max(0, NOISE_SECONDS - v.dur - 0.05));
          b.stop(stop + 0.02);
        } else {
          const o = c.createOscillator();
          o.type = v.tone;
          o.frequency.setValueAtTime(v.freq, start);
          if (v.to) o.frequency.exponentialRampToValueAtTime(v.to, stop);
          if (v.tone === "sawtooth") {
            // brass, not buzz: take the edge off
            const low = c.createBiquadFilter();
            low.type = "lowpass";
            low.frequency.value = 1800;
            o.connect(low).connect(env);
          } else o.connect(env);
          o.start(start);
          o.stop(stop + 0.02);
        }
        end = Math.max(end, v.at + v.dur);
      }
      window.setTimeout(() => out.disconnect(), (end + 0.2) * 1000);
    },
  };
}
