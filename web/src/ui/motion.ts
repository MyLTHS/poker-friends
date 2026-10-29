// Motion conventions of D1: one set of durations, easings and staggers for every animation, and
// two small Web Animations helpers. CSS uses the same values as --dur-* / --ease-* (tokens.css);
// the animation-by-animation plan is docs/c2-chuyen-dong.md. No animation library: everything
// here is CSS transitions or element.animate().

/** Milliseconds. */
export const DURATION = {
  /** button press, tap feedback */
  press: 90,
  /** hover, toggle, toast leaving */
  fast: 140,
  /** toast in, tab change, small fades */
  base: 220,
  /** modal and sheet open/close */
  slow: 320,
  /** one card flying from the dealer to a seat */
  deal: 440,
  /** a bet flying from a seat to its spot in front of the seat / into the pot */
  chip: 480,
  /** the pot sliding to the winner */
  collect: 950,
  /** a card turning over */
  flip: 650,
  /** one breath of the "your turn" halo */
  turnPulse: 1600,
  /** the whole 7-2 moment before it settles into a banner */
  sevenDeuce: 2600,
} as const;

export const EASE = {
  /** most UI changes */
  standard: "cubic-bezier(0.2, 0, 0, 1)",
  /** things arriving: decelerate into place */
  out: "cubic-bezier(0.16, 1, 0.3, 1)",
  /** things leaving: accelerate away */
  in: "cubic-bezier(0.4, 0, 1, 1)",
  /** chips and cards landing: a small overshoot, like a chip settling on felt */
  settle: "cubic-bezier(0.34, 1.4, 0.64, 1)",
  /** countdowns: time runs evenly */
  linear: "linear",
} as const;

/** Delay between the items of one sequence, in ms. */
export const STAGGER = {
  /** card to card while dealing (round-robin from the small blind) */
  deal: 170,
  /** chips of several players moving at once (bets into the pot) */
  chips: 40,
  /** hands turning over at showdown, in showdown order */
  showdown: 1100,
} as const;

/** A short rest between two steps of one hand (bets gathered, then the board; hands shown, then
 *  the pot paid), so a step lands before the next one starts. */
export const BEAT = 380;

/** Duration of the fade that replaces a movement when the user asked for reduced motion. */
export const REDUCED_FADE = 120;

export function prefersReducedMotion(): boolean {
  return typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

type Box = Pick<DOMRect, "left" | "top" | "width" | "height">;

/** FLIP keyframes moving an element that already sits at `to` so it starts at `from`: translate +
 *  scale from the old box to identity. `lift` raises the middle of the path by that many px (a card
 *  or chip thrown in an arc rather than slid). */
export function flyKeyframes(from: Box, to: Box, lift = 0): Keyframe[] {
  const dx = from.left + from.width / 2 - (to.left + to.width / 2);
  const dy = from.top + from.height / 2 - (to.top + to.height / 2);
  const sx = to.width ? from.width / to.width : 1;
  const sy = to.height ? from.height / to.height : 1;
  const start = { transform: `translate(${dx}px, ${dy}px) scale(${sx}, ${sy})` };
  const end = { transform: "translate(0px, 0px) scale(1, 1)" };
  if (!lift) return [start, end];
  const mid = { transform: `translate(${dx / 2}px, ${dy / 2 - lift}px) scale(${(sx + 1) / 2}, ${(sy + 1) / 2})`, offset: 0.5 };
  return [start, mid, end];
}

type PlayOptions = { duration: number; easing?: string; delay?: number; fill?: FillMode };

/** element.animate() that honours reduced motion: the movement becomes a short fade in (or
 *  nothing, with reduced: "skip"). Returns null when nothing runs. */
export function play(
  el: Element,
  keyframes: Keyframe[],
  { duration, easing = EASE.standard, delay = 0, fill = "backwards" }: PlayOptions,
  reduced: "fade" | "skip" = "fade",
): Animation | null {
  if (typeof el.animate !== "function") return null;
  if (prefersReducedMotion()) {
    if (reduced === "skip") return null;
    return el.animate([{ opacity: 0 }, { opacity: 1 }], { duration: REDUCED_FADE, delay: Math.min(delay, 200), easing: EASE.standard, fill });
  }
  return el.animate(keyframes, { duration, easing, delay, fill });
}

/** Animate `el` (already rendered at its new place) from the box it came from: a dealt card from
 *  the deck, a bet from a seat, the pot to the winner. Measure `from` before React re-renders. */
export function fly(el: Element, from: Box, opts: PlayOptions & { lift?: number }): Animation | null {
  const to = el.getBoundingClientRect();
  return play(el, flyKeyframes(from, to, opts.lift), { easing: EASE.out, ...opts });
}
