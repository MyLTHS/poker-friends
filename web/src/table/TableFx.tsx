"use client";

// Plays the animation cues (cues.ts) over a stage that already shows the new state
// (docs/c2-chuyen-dong.md): cards dealt from the middle, bets slid out and gathered, the pot sent
// to the winners, hands turned over in turn. Real elements are moved FLIP-style from where they
// came from; what no longer exists (gathered bets, the paid pot, folded cards) flies as a ghost
// that removes itself. New cues finish the running ones first, a snapshot (epoch) finishes all,
// a hidden tab skips them, and reduced motion turns movements into fades (ghosts are skipped).
import { memo, useCallback, useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore, type RefObject } from "react";

import { BEAT, ChipStack, Confetti, DURATION, EASE, PlayingCard, STAGGER, fmt, play, prefersReducedMotion } from "@/ui";

import type { Cue } from "./cues";
import { GEO, betPos, spotPos, type Device, type Pt } from "./geometry";

type Ghost = {
  key: number;
  kind: "chips" | "pot" | "cards";
  amount: number;
  from: Pt;
  to: Pt;
  delay: number;
  duration: number;
  easing: string;
  lift: number;
  fadeOut: boolean;
  small: boolean;
};

export type FxApi = {
  /** Seats whose shown cards still face down (showdown in progress). */
  unflipped: Set<number>;
};

/** How long a full house or better holds the table before the pot moves. */
export const BIG_HAND_MS = 1800;
/** Board cards lie face down this long after landing, before they turn. */
const BOARD_REST = 140;
/** A win burst stays this long (its pieces fade within --dur-confetti). */
const BURST_MS = 1500;

/** Centre of an element in stage pixels. */
function centre(el: Element, stage: Element, device: Device): Pt {
  const s = stage.getBoundingClientRect();
  const r = el.getBoundingClientRect();
  const k = s.width / GEO[device].w || 1;
  return { x: (r.left + r.width / 2 - s.left) / k, y: (r.top + r.height / 2 - s.top) / k };
}

/** Keyframes bringing an element from `from` (stage px) to where it sits, keeping its own
 *  transform (cards are rotated). `fade` also fades it in. */
function arrive(el: HTMLElement, from: Pt, at: Pt, opts: { lift?: number; scale?: number; fade?: boolean }): Keyframe[] {
  const base = el.style.transform || "";
  const dx = from.x - at.x;
  const dy = from.y - at.y;
  const s = opts.scale ?? 1;
  const start: Keyframe = { transform: `translate(${dx}px, ${dy}px) scale(${s}) ${base}`, ...(opts.fade ? { opacity: 0 } : {}) };
  const end: Keyframe = { transform: `translate(0px, 0px) scale(1) ${base}`, ...(opts.fade ? { opacity: 1 } : {}) };
  if (!opts.lift) return [start, end];
  const mid: Keyframe = { transform: `translate(${dx / 2}px, ${dy / 2 - opts.lift}px) scale(${(s + 1) / 2}) ${base}`, offset: 0.5, ...(opts.fade ? { opacity: 1 } : {}) };
  return [start, mid, end];
}

/** Where a seat sits on the stage: its spot, and whether it is my own seat. */
export type SeatPlace = { spot: number; me: boolean };

/** What flies over the stage right now. Kept in a small store of its own so that a chip landing
 *  or a burst fading redraws only the effects layer, not the whole table. */
type Scene = { ghosts: Ghost[]; bursts: { key: number; at: Pt }[]; big: { key: number; title: string } | null };
const EMPTY_SCENE: Scene = { ghosts: [], bursts: [], big: null };

function createScene() {
  let state = EMPTY_SCENE;
  const subs = new Set<() => void>();
  return {
    get: () => state,
    set(next: (s: Scene) => Scene) {
      const after = next(state);
      if (after === state) return;
      state = after;
      for (const notify of subs) notify();
    },
    subscribe(notify: () => void) {
      subs.add(notify);
      return () => {
        subs.delete(notify);
      };
    },
  };
}
type SceneStore = ReturnType<typeof createScene>;

export function useTableFx({ cues, epoch, device, placeOf }: { cues: Cue[]; epoch: number; device: Device; placeOf: (seat: number) => SeatPlace | undefined }) {
  const layer = useRef<HTMLDivElement>(null);
  const [scene] = useState(createScene);
  const [unflipped, setUnflipped] = useState<Set<number>>(() => new Set());
  const played = useRef<number>(cues.at(-1)?.id ?? 0);
  const running = useRef(new Set<Animation>());
  const timers = useRef<{ id: ReturnType<typeof setTimeout>; run: () => void }[]>([]);
  const seq = useRef(0);
  const lastEpoch = useRef(epoch);

  const stage = () => layer.current?.closest(".stage") ?? null;

  const track = useCallback((a: Animation | null) => {
    if (!a) return;
    running.current.add(a);
    const done = () => running.current.delete(a);
    a.addEventListener("finish", done);
    a.addEventListener("cancel", done);
  }, []);

  const later = (ms: number, run: () => void) => {
    const entry = { id: setTimeout(() => {
      timers.current.splice(timers.current.indexOf(entry), 1);
      run();
    }, ms), run };
    timers.current.push(entry);
  };

  const holdClass = (name: string, ms: number) => {
    const el = stage();
    if (!el || ms <= 0) return;
    el.classList.add(name);
    later(ms, () => stage()?.classList.remove(name));
  };

  /** Jump every running animation and pending step to its end. */
  const finishAll = useCallback(() => {
    for (const t of timers.current.splice(0)) {
      clearTimeout(t.id);
      t.run();
    }
    for (const a of [...running.current]) a.finish();
    running.current.clear();
    scene.set((sc) => (sc === EMPTY_SCENE ? sc : EMPTY_SCENE));
    setUnflipped((u) => (u.size ? new Set() : u));
  }, [scene]);

  useLayoutEffect(() => {
    if (lastEpoch.current !== epoch) {
      lastEpoch.current = epoch;
      finishAll();
      played.current = cues.at(-1)?.id ?? played.current;
      return;
    }
    const fresh = cues.filter((c) => c.id > played.current);
    if (fresh.length === 0) return;
    played.current = fresh.at(-1)!.id;
    // Cards shown after the hand turn over beside what is still playing.
    if (fresh.every((c) => c.kind === "reveal")) {
      for (const c of fresh) {
        if (c.kind !== "reveal") continue;
        setUnflipped((u) => new Set(u).add(c.seat));
        later(60, () =>
          setUnflipped((u) => {
            const next = new Set(u);
            next.delete(c.seat);
            return next;
          }),
        );
      }
      return;
    }
    finishAll();
    const root = stage();
    if (!root || (typeof document !== "undefined" && document.hidden)) return;
    const g = GEO[device];
    const reduced = prefersReducedMotion();
    const newGhosts: Ghost[] = [];
    const ghost = (gh: Omit<Ghost, "key">) => newGhosts.push({ ...gh, key: ++seq.current });
    const d = device === "desktop";
    let t = 0;

    for (const cue of fresh) {
      switch (cue.kind) {
        case "deal": {
          const n = cue.order.length;
          cue.order.forEach((seat, i) => {
            const box = root.querySelector(`[data-seat-cards="${seat}"]`);
            const cards = box ? [...box.querySelectorAll<HTMLElement>(":scope > .pc, :scope > .pc-flip")] : [];
            cards.forEach((card, round) => {
              track(play(card, arrive(card, g.c, centre(card, root, device), { lift: 16, scale: 0.6, fade: true }), { duration: DURATION.deal, easing: EASE.out, delay: t + (round * n + i) * STAGGER.deal }));
            });
          });
          t += (2 * n - 1) * STAGGER.deal + DURATION.deal;
          break;
        }
        case "bet": {
          const el = root.querySelector<HTMLElement>(`[data-bet="${cue.seat}"]`);
          const at = placeOf(cue.seat);
          if (el && at) track(play(el, arrive(el, spotPos(device, at.spot, at.me), centre(el, root, device), { scale: 0.7 }), { duration: DURATION.chip, easing: EASE.settle, delay: t }));
          t += DURATION.chip;
          break;
        }
        case "fold": {
          const at = placeOf(cue.seat);
          if (at && !reduced) ghost({ kind: "cards", amount: 0, from: spotPos(device, at.spot, at.me), to: g.c, delay: t, duration: DURATION.base, easing: EASE.in, lift: 0, fadeOut: true, small: !d });
          break;
        }
        case "collect": {
          if (!reduced) {
            cue.bets.forEach((b, i) => {
              const at = placeOf(b.seat);
              if (at) ghost({ kind: "chips", amount: b.amount, from: betPos(device, at.spot, at.me), to: g.pot, delay: t + i * STAGGER.chips, duration: DURATION.chip, easing: EASE.settle, lift: 0, fadeOut: true, small: !d });
            });
          }
          t += DURATION.chip + (cue.bets.length - 1) * STAGGER.chips + BEAT;
          break;
        }
        case "board": {
          // The new cards slide out face down, then turn over one after the other.
          const n = cue.to - cue.from;
          const turnAt = t + (n - 1) * STAGGER.deal + DURATION.deal + BOARD_REST;
          for (let i = cue.from; i < cue.to; i++) {
            const el = root.querySelector<HTMLElement>(`[data-board="${i}"]`);
            if (!el) continue;
            const k = i - cue.from;
            track(play(el, arrive(el, g.pot, centre(el, root, device), { lift: 12, scale: 0.7, fade: true }), { duration: DURATION.deal, easing: EASE.out, delay: t + k * STAGGER.deal }));
            if (reduced) continue;
            el.classList.add("pc-back", "fx-back");
            const base = el.style.transform || "";
            const flipAt = turnAt + k * STAGGER.boardFlip;
            track(play(el, [{ transform: `${base} scaleX(1)` }, { transform: `${base} scaleX(0.04)`, offset: 0.5 }, { transform: `${base} scaleX(1)` }], { duration: DURATION.boardFlip, easing: EASE.standard, delay: flipAt }));
            later(flipAt + DURATION.boardFlip / 2, () => el.classList.remove("pc-back", "fx-back"));
          }
          t = reduced ? t + (n - 1) * STAGGER.deal + DURATION.deal + BEAT : turnAt + (n - 1) * STAGGER.boardFlip + DURATION.boardFlip + BEAT;
          break;
        }
        case "showdown": {
          setUnflipped(new Set(cue.order));
          cue.order.forEach((seat, i) =>
            later(t + i * STAGGER.showdown, () =>
              setUnflipped((u) => {
                const next = new Set(u);
                next.delete(seat);
                return next;
              }),
            ),
          );
          t += (cue.order.length - 1) * STAGGER.showdown + DURATION.flip + BEAT;
          break;
        }
        case "big": {
          // The seat glows and the title bursts over the felt; the pot waits for it.
          const seatEl = root.querySelector(`[data-seat="${cue.seat}"]`);
          const key = ++seq.current;
          later(t, () => {
            seatEl?.classList.add("fx-big-seat");
            scene.set((sc) => ({ ...sc, big: { key, title: cue.title } }));
          });
          later(t + BIG_HAND_MS + 1600, () => {
            seatEl?.classList.remove("fx-big-seat");
            scene.set((sc) => (sc.big?.key === key ? { ...sc, big: null } : sc));
          });
          t += reduced ? 0 : BIG_HAND_MS;
          break;
        }
        case "award": {
          // Deltas and the winner banner wait for the chips to arrive.
          const end = t + cue.pots.length * (DURATION.collect + BEAT);
          if (!reduced) {
            cue.pots.forEach((pot, i) => {
              for (const { seat, amount } of pot.winners) {
                const at = placeOf(seat);
                if (!at) continue;
                const to = spotPos(device, at.spot, at.me);
                const lands = t + i * (DURATION.collect + BEAT);
                ghost({ kind: "pot", amount, from: g.pot, to, delay: lands, duration: DURATION.collect, easing: EASE.out, lift: d ? 46 : 28, fadeOut: true, small: !d });
                // a little gold burst where the chips land (the main pot only)
                if (i === 0) {
                  const key = ++seq.current;
                  later(lands + DURATION.collect * 0.8, () => scene.set((sc) => ({ ...sc, bursts: [...sc.bursts, { key, at: to }] })));
                  later(lands + DURATION.collect * 0.8 + BURST_MS, () => scene.set((sc) => ({ ...sc, bursts: sc.bursts.filter((b) => b.key !== key) })));
                }
              }
            });
            holdClass("fx-hold-result", end);
          }
          t = end;
          break;
        }
        case "seven":
        case "reveal":
          break;
      }
    }
    if (newGhosts.length) scene.set((sc) => ({ ...sc, ghosts: newGhosts }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cues, epoch, device]);

  // Leaving the page: drop the steps still waiting (they would set state on an unmounted table).
  useEffect(() => {
    const pending = timers.current;
    return () => {
      for (const t of pending.splice(0)) clearTimeout(t.id);
    };
  }, []);

  const layerEl = <FxLayer scene={scene} device={device} layerRef={layer} track={track} />;
  return { layer: layerEl, fx: { unflipped } satisfies FxApi };
}

/** The effects layer: flying chips and cards, win bursts, the big-hand title. Subscribed to the
 *  scene store, so its own updates never re-render the table around it. */
const FxLayer = memo(function FxLayer({ scene, device, layerRef, track }: { scene: SceneStore; device: Device; layerRef: RefObject<HTMLDivElement | null>; track: (a: Animation | null) => void }) {
  const { ghosts, bursts, big } = useSyncExternalStore(scene.subscribe, scene.get, scene.get);
  // A finished flight leaves the scene; when the last one lands the list empties at once.
  const done = useCallback((key: number) => scene.set((sc) => ({ ...sc, ghosts: sc.ghosts.filter((g) => g.key !== key) })), [scene]);
  return (
    <>
      <div ref={layerRef} className="fx-layer" aria-hidden>
        {ghosts.map((gh) => (
          <GhostPiece key={gh.key} ghost={gh} onDone={done} track={track} />
        ))}
        {bursts.map((b) => (
          <span key={b.key} className="fx-burst" style={{ left: b.at.x, top: b.at.y }}>
            <Confetti count={20} small spread={0.7} />
          </span>
        ))}
      </div>
      {big && (
        <div key={big.key} className="fx-big" style={{ left: GEO[device].c.x, top: GEO[device].c.y }} role="status">
          <Confetti count={44} spread={1.6} />
          <b className="fx-big-title">{big.title}</b>
        </div>
      )}
    </>
  );
});

function GhostPiece({ ghost, onDone, track }: { ghost: Ghost; onDone: (key: number) => void; track: (a: Animation | null) => void }) {
  const ref = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el || typeof el.animate !== "function") return onDone(ghost.key);
    const dx = ghost.from.x - ghost.to.x;
    const dy = ghost.from.y - ghost.to.y;
    // The easing shapes the flight only (keyframe easing); the short fade at the end is linear,
    // so an "out" curve does not swallow the whole trip.
    const fly = ghost.kind === "cards" ? 1 : 0.84;
    // A lift arcs the flight: up over the middle, then down onto the seat.
    const frames: Keyframe[] = [
      { transform: `translate(${dx}px, ${dy}px)`, opacity: 1, easing: ghost.easing },
      ...(ghost.lift ? [{ transform: `translate(${dx / 2}px, ${dy / 2 - ghost.lift}px) scale(1.12)`, offset: fly / 2 }] : []),
      { transform: "translate(0px, 0px)", opacity: ghost.kind === "cards" ? 0 : 1, offset: fly },
    ];
    if (fly < 1) frames.push({ transform: "translate(0px, 0px)", opacity: 0 });
    const a = el.animate(frames, { duration: ghost.duration / fly, delay: ghost.delay, easing: "linear", fill: "both" });
    track(a);
    a.addEventListener("finish", () => onDone(ghost.key));
    a.addEventListener("cancel", () => onDone(ghost.key));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const s = ghost.small;
  return (
    <div ref={ref} className={`fx-ghost fx-${ghost.kind}`} style={{ left: ghost.to.x, top: ghost.to.y }}>
      {ghost.kind === "cards" ? (
        <>
          <PlayingCard card="??" w={s ? 15 : 24} rotate={-10} />
          <PlayingCard card="??" w={s ? 15 : 24} rotate={8} />
        </>
      ) : (
        <>
          <ChipStack amount={ghost.amount} size={s ? 14 : ghost.kind === "pot" ? 22 : 20} cols={ghost.kind === "pot" ? (s ? 2 : 3) : 1} max={4} />
          {ghost.kind === "pot" && <span className="pot-pill is-win"><b>+{fmt(ghost.amount)}</b></span>}
        </>
      )}
    </div>
  );
}
