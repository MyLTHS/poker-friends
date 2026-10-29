// Table sounds, made on the spot with Web Audio (no sound files, nothing licensed): a card flick
// per card dealt (hole cards and board cards), a chip click for a bet, a soft chime when it
// becomes my turn, a tick when my clock runs low, chips clinking to the pot's winner (a brighter
// jingle when that is me), a fanfare for a full house or better, and a brass fanfare for 7-2.
// Off by default; the choice (on/off + volume) is kept in localStorage, every access guarded
// (private windows and blocked storage throw).
import type { CueBody } from "./cues";
import { readJson, writeJson } from "./prefs";

export type SoundName = "deal" | "chip" | "turn" | "hurry" | "pot" | "win" | "big" | "seven";

export type SoundPrefs = { on: boolean; volume: number };

export const DEFAULT_PREFS: SoundPrefs = { on: false, volume: 0.35 };
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
  return { on: data.on === true, volume };
}

export function writePrefs(prefs: SoundPrefs, store?: Storage | null): void {
  writeJson(KEY, prefs, store);
}

/** Sounds for the animation cues of one state event. `mySeat` = my seat, null when watching. */
export function soundsForCues(cues: CueBody[], mySeat: number | null): { name: SoundName; count?: number }[] {
  const out: { name: SoundName; count?: number }[] = [];
  for (const cue of cues) {
    if (cue.kind === "deal") out.push({ name: "deal", count: Math.min(cue.order.length * 2, 12) });
    else if (cue.kind === "board") out.push({ name: "deal", count: cue.to - cue.from });
    else if (cue.kind === "bet") out.push({ name: "chip" });
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

/** One voice: a tone (oscillator, optional glide to `to`) or a burst of filtered noise. Times in s. */
export type Voice =
  | { at: number; dur: number; gain: number; tone: OscillatorType; freq: number; to?: number }
  | { at: number; dur: number; gain: number; noise: number /* band-pass centre, Hz */ };

const note = (n: number) => 440 * 2 ** (n / 12); // semitones from A4

/** The notes of each sound. `count` repeats the deal flick once per card. */
export function recipe(name: SoundName, count = 1): Voice[] {
  switch (name) {
    case "deal":
      return Array.from({ length: Math.max(1, count) }, (_, i) => ({ at: i * 0.09, dur: 0.05, gain: 0.5, noise: 2600 + (i % 3) * 400 }));
    case "chip":
      return [
        { at: 0, dur: 0.05, gain: 0.16, tone: "triangle", freq: note(27) },
        { at: 0.045, dur: 0.06, gain: 0.12, tone: "triangle", freq: note(31) },
      ];
    case "big":
      return [
        ...[0, 4, 7, 12].map((n, i) => ({ at: i * 0.11, dur: 0.22, gain: 0.18, tone: "square" as const, freq: note(n + 3) })),
        ...[3, 7, 10, 15].map((n) => ({ at: 0.46, dur: 1.1, gain: 0.12, tone: "sawtooth" as const, freq: note(n) })),
      ];
    case "turn":
      return [
        { at: 0, dur: 0.35, gain: 0.32, tone: "sine", freq: note(7) }, // E5
        { at: 0.12, dur: 0.5, gain: 0.3, tone: "sine", freq: note(12) }, // A5
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
  play: (name: SoundName, volume: number, count?: number) => void;
  /** From a click or key only: makes the AudioContext, or resumes it (browsers start audio only
   *  after a gesture). Until then play() stays silent. */
  wake: () => void;
  /** Leaving the table: give the audio device back. */
  close: () => void;
};

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
    noise = c.createBuffer(1, Math.round(c.sampleRate * 0.5), c.sampleRate);
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
    play(name, volume, count) {
      // never made or not yet allowed to run: nothing to hear, and no autoplay warning
      const c = ctx;
      if (!c || c.state !== "running" || volume <= 0) return;
      const out = c.createGain();
      out.gain.value = volume;
      out.connect(c.destination);
      const t0 = c.currentTime + 0.01;
      let end = 0;
      for (const v of recipe(name, count)) {
        const start = t0 + v.at;
        const env = c.createGain();
        env.gain.setValueAtTime(0.0001, start);
        env.gain.exponentialRampToValueAtTime(v.gain, start + 0.006);
        env.gain.exponentialRampToValueAtTime(0.0001, start + v.dur);
        env.connect(out);
        let src: AudioScheduledSourceNode;
        if ("noise" in v) {
          const b = c.createBufferSource();
          b.buffer = noiseBuffer(c);
          const band = c.createBiquadFilter();
          band.type = "bandpass";
          band.frequency.value = v.noise;
          band.Q.value = 1.2;
          b.connect(band).connect(env);
          src = b;
        } else {
          const o = c.createOscillator();
          o.type = v.tone;
          o.frequency.setValueAtTime(v.freq, start);
          if (v.to) o.frequency.exponentialRampToValueAtTime(v.to, start + v.dur);
          if (v.tone === "sawtooth") {
            // brass, not buzz: take the edge off
            const low = c.createBiquadFilter();
            low.type = "lowpass";
            low.frequency.value = 1800;
            o.connect(low).connect(env);
          } else o.connect(env);
          src = o;
        }
        src.start(start);
        src.stop(start + v.dur + 0.02);
        end = Math.max(end, v.at + v.dur);
      }
      window.setTimeout(() => out.disconnect(), (end + 0.2) * 1000);
    },
  };
}
