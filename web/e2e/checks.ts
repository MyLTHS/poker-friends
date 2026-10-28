// Measurements for the landscape phone and a small accessibility audit, run inside the page.
// Each returns a list of problems (empty = fine) so a failure names every element at once.
// There is no axe-core in web/ yet; a11yProblems checks the rules the account screens rely on.

import type { Page } from "@playwright/test";

/** The landscape phones the beta is played on: iPhone 14/15, the Pro Max, an SE. */
export const PHONES = [
  { width: 844, height: 390 },
  { width: 932, height: 430 },
  { width: 667, height: 375 },
] as const;

/** Nothing sticks out of the screen sideways, no label runs past its own box, and no text box is
 *  squeezed too narrow to read. */
export function layoutProblems(page: Page): Promise<string[]> {
  return page.evaluate((MIN_INPUT) => {
    const width = document.documentElement.clientWidth;
    const problems: string[] = [];
    const describe = (el: Element) => {
      const cls = typeof el.className === "string" && el.className.trim() ? `.${el.className.trim().split(/\s+/).join(".")}` : "";
      const text = (el.textContent ?? "").trim().replace(/\s+/g, " ").slice(0, 40);
      return `<${el.tagName.toLowerCase()}${cls}>${text ? ` "${text}"` : ""}`;
    };
    // Spilling out of a box that clips its overflow, and is itself on screen, is not visible.
    const contained = (el: Element) => {
      for (let a = el.parentElement; a && a !== document.body; a = a.parentElement) {
        if (getComputedStyle(a).overflowX === "visible") continue;
        const r = a.getBoundingClientRect();
        return r.left >= -1 && r.right <= width + 1;
      }
      return false;
    };
    const page = document.documentElement.scrollWidth;
    if (page > width) problems.push(`the page scrolls sideways (${page}px wide in ${width}px)`);
    for (const el of document.body.querySelectorAll("*")) {
      if (el.closest("[aria-hidden='true']") || !el.checkVisibility()) continue; // decoration may bleed off
      const r = el.getBoundingClientRect();
      if (r.width === 0 || r.height === 0) continue;
      if ((r.left < -1 || r.right > width + 1) && !contained(el)) {
        problems.push(`${describe(el)} sticks out (${Math.round(r.left)} to ${Math.round(r.right)} of ${width})`);
      }
      const style = getComputedStyle(el);
      if (/auto|scroll/.test(style.overflowX) && el.scrollWidth > el.clientWidth + 1) {
        problems.push(`${describe(el)} scrolls sideways inside (${el.scrollWidth}px in ${el.clientWidth}px)`);
      }
    }
    for (const el of document.body.querySelectorAll(".btn, h1, h2, h3, label, .badge, .step-label, .appbar-title")) {
      if (!el.checkVisibility() || getComputedStyle(el).overflowX !== "visible") continue;
      if (el.scrollWidth > el.clientWidth + 1) problems.push(`${describe(el)} does not fit its box (${el.scrollWidth}px in ${el.clientWidth}px)`);
    }
    // squeezed but on screen is still broken: an email address must show more than a few letters
    for (const input of document.body.querySelectorAll<HTMLInputElement>("input[type=text], input[type=email], input[type=password], input:not([type])")) {
      const { width } = input.getBoundingClientRect();
      if (input.checkVisibility() && width < MIN_INPUT) problems.push(`input "${input.name}" is only ${Math.round(width)}px wide`);
    }
    return problems;
  }, MIN_INPUT_WIDTH);
}

/** The narrowest text box still worth typing in (about 12 letters at 16px). */
const MIN_INPUT_WIDTH = 100;

/** Everything a finger presses is at least 44×44 px, counting the invisible ::before that widens
 *  small controls on the phone (ui/d1.css). */
export function smallTargets(page: Page, min = 44): Promise<string[]> {
  return page.evaluate((min) => {
    const problems: string[] = [];
    const targets = "a[href], button, input:not([type=hidden]), select, textarea, [role=tab], [role=switch], label.check";
    for (const el of document.body.querySelectorAll(targets)) {
      if (!el.checkVisibility() || el.closest("[aria-hidden='true']")) continue;
      if (el.matches("input[type=checkbox]") && el.closest("label.check")) continue; // the label is the target
      const r = el.getBoundingClientRect();
      let { width, height } = r;
      const before = getComputedStyle(el, "::before");
      if (before.content !== "none" && before.position === "absolute") {
        const px = (v: string) => Math.min(0, parseFloat(v) || 0);
        width = Math.max(width, r.width - px(before.left) - px(before.right));
        height = Math.max(height, r.height - px(before.top) - px(before.bottom));
      }
      if (width + 0.5 < min || height + 0.5 < min) {
        const name = el.getAttribute("aria-label") ?? el.getAttribute("name") ?? el.textContent?.trim().slice(0, 30);
        problems.push(`<${el.tagName.toLowerCase()}> "${name}" is ${Math.round(width)}×${Math.round(height)}`);
      }
    }
    return problems;
  }, min);
}

/** Labels, names, the ids aria-* points at, and one h1 per page. */
export function a11yProblems(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const problems: string[] = [];
    const visible = (selector: string) => [...document.querySelectorAll<HTMLElement>(selector)].filter((el) => el.checkVisibility());
    for (const input of visible("input:not([type=hidden]), select, textarea") as HTMLInputElement[]) {
      const named = (input.labels?.length ?? 0) > 0 || input.getAttribute("aria-label") || input.getAttribute("aria-labelledby");
      if (!named) problems.push(`input "${input.name}" has no label`);
    }
    for (const el of visible("button, a[href], [role=button]")) {
      const name = el.getAttribute("aria-label") || el.getAttribute("title") || el.textContent?.trim();
      if (!name) problems.push(`<${el.tagName.toLowerCase()}> ${el.outerHTML.slice(0, 80)} has no name`);
    }
    for (const el of document.querySelectorAll("[aria-describedby], [aria-labelledby]")) {
      for (const attr of ["aria-describedby", "aria-labelledby"]) {
        for (const id of (el.getAttribute(attr) ?? "").split(/\s+/).filter(Boolean)) {
          if (!document.getElementById(id)) problems.push(`${attr}="${id}" points at nothing`);
        }
      }
    }
    for (const input of visible("[aria-invalid=true]")) {
      const ids = (input.getAttribute("aria-describedby") ?? "").split(/\s+/).filter(Boolean);
      const said = ids.map((id) => document.getElementById(id)?.textContent?.trim()).filter(Boolean);
      if (said.length === 0) problems.push(`invalid "${input.getAttribute("name")}" does not say why (aria-describedby)`);
    }
    const ids = [...document.querySelectorAll("[id]")].map((el) => el.id);
    for (const id of new Set(ids.filter((id, i) => ids.indexOf(id) !== i))) problems.push(`id "${id}" is used twice`);
    const h1 = visible("h1").length;
    if (h1 !== 1) problems.push(`${h1} visible h1 (want one)`);
    return problems;
  });
}
