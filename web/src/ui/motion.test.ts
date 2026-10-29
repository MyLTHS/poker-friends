import { afterEach, describe, expect, it, vi } from "vitest";

import { DURATION, EASE, REDUCED_FADE, fly, flyKeyframes, play } from "./motion";

const box = (left: number, top: number, width: number, height: number) => ({ left, top, width, height });

/** A stand-in element that records what it was asked to animate. */
function fakeElement(rect = box(0, 0, 10, 10)) {
  const calls: { keyframes: Keyframe[]; options: KeyframeAnimationOptions }[] = [];
  const el = {
    animate(keyframes: Keyframe[], options: KeyframeAnimationOptions) {
      calls.push({ keyframes, options });
      return { keyframes, options } as unknown as Animation;
    },
    getBoundingClientRect: () => rect as DOMRect,
  } as unknown as Element;
  return { el, calls };
}

function reducedMotion(on: boolean) {
  vi.stubGlobal("window", { matchMedia: () => ({ matches: on }) });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("flyKeyframes", () => {
  it("starts at the old box, measured centre to centre, and ends in place", () => {
    // from: centre (10, 20), 20×40; to: centre (120, 220), 40×40
    const frames = flyKeyframes(box(0, 0, 20, 40), box(100, 200, 40, 40));
    expect(frames).toEqual([
      { transform: "translate(-110px, -200px) scale(0.5, 1)" },
      { transform: "translate(0px, 0px) scale(1, 1)" },
    ]);
  });

  it("does not move or scale a box that stayed put", () => {
    const same = box(50, 60, 30, 30);
    expect(flyKeyframes(same, same)).toEqual([
      { transform: "translate(0px, 0px) scale(1, 1)" },
      { transform: "translate(0px, 0px) scale(1, 1)" },
    ]);
  });

  it("with a lift, adds a middle keyframe raised by that much, halfway in place and size", () => {
    const frames = flyKeyframes(box(0, 0, 20, 40), box(100, 200, 40, 40), 30);
    expect(frames).toHaveLength(3);
    expect(frames[1]).toEqual({ transform: "translate(-55px, -130px) scale(0.75, 1)", offset: 0.5 });
    expect(frames[2]).toEqual({ transform: "translate(0px, 0px) scale(1, 1)" });
  });

  it("does not divide by zero for a target with no size", () => {
    const [start] = flyKeyframes(box(0, 0, 20, 20), box(0, 0, 0, 0));
    expect(start).toEqual({ transform: "translate(10px, 10px) scale(1, 1)" });
  });
});

describe("play", () => {
  it("returns null when the element cannot animate (no Web Animations, e.g. on the server)", () => {
    expect(play({} as Element, [{ opacity: 0 }, { opacity: 1 }], { duration: 100 })).toBeNull();
  });

  it("runs the keyframes with the standard easing and backwards fill by default", () => {
    const { el, calls } = fakeElement();
    const frames = [{ opacity: 0 }, { opacity: 1 }];
    expect(play(el, frames, { duration: DURATION.deal, delay: 90 })).not.toBeNull();
    expect(calls).toEqual([
      { keyframes: frames, options: { duration: DURATION.deal, easing: EASE.standard, delay: 90, fill: "backwards" } },
    ]);
  });

  it("with reduced motion, fades in quickly instead of moving", () => {
    reducedMotion(true);
    const { el, calls } = fakeElement();
    play(el, [{ transform: "translateX(-200px)" }, { transform: "none" }], { duration: DURATION.chip, delay: 600 });
    expect(calls).toHaveLength(1);
    expect(calls[0].keyframes).toEqual([{ opacity: 0 }, { opacity: 1 }]);
    expect(calls[0].options.duration).toBe(REDUCED_FADE);
    expect(calls[0].options.delay).toBe(200); // a long stagger is capped, nobody waits on a fade
  });

  it("with reduced motion and reduced: skip, runs nothing", () => {
    reducedMotion(true);
    const { el, calls } = fakeElement();
    expect(play(el, [{ opacity: 0 }, { opacity: 1 }], { duration: 100 }, "skip")).toBeNull();
    expect(calls).toHaveLength(0);
  });

  it("without reduced motion asked for, moves as normal", () => {
    reducedMotion(false);
    const { el, calls } = fakeElement();
    play(el, [{ opacity: 0 }, { opacity: 1 }], { duration: 100 });
    expect(calls[0].options.duration).toBe(100);
  });
});

describe("fly", () => {
  it("measures where the element is now and flies it in from the old box, decelerating", () => {
    const { el, calls } = fakeElement(box(100, 200, 40, 40));
    fly(el, box(0, 0, 20, 40), { duration: DURATION.deal, lift: 30 });
    expect(calls).toHaveLength(1);
    expect(calls[0].keyframes).toEqual(flyKeyframes(box(0, 0, 20, 40), box(100, 200, 40, 40), 30));
    expect(calls[0].options.easing).toBe(EASE.out);
  });
});
