// Shared by the C5 specs: REST calls as a logged-in browser, new guests, and the in-page checks
// that nothing sticks out of a phone screen and that every control is big enough to tap.
import { expect, type Browser, type BrowserContextOptions, type Page } from "@playwright/test";

// E2E_WEB: run the specs against a dev server already running (see playwright.config.ts)
export const WEB = process.env.E2E_WEB ?? "http://localhost:3100";

export async function api(page: Page, method: string, path: string, data?: unknown) {
  const cookies = await page.context().cookies(WEB);
  const csrf = cookies.find((c) => c.name === "csrftoken")?.value ?? "";
  const response = await page.request.fetch(WEB + path, {
    method,
    data,
    headers: { "X-CSRFToken": csrf, Referer: `${WEB}/`, Origin: WEB },
  });
  expect(response.ok(), `${method} ${path}: ${response.status()} ${await response.text()}`).toBeTruthy();
  return response.status() === 204 ? null : response.json();
}

/** A fresh browser (own cookies) logged in as a new guest. Names must be unique per run. */
export async function newGuest(browser: Browser, name: string, options: BrowserContextOptions = {}) {
  const context = await browser.newContext(options);
  const page = await context.newPage();
  await api(page, "GET", "/api/auth/config/");
  const me = await api(page, "POST", "/api/auth/guest/", { username: name });
  return { name, context, page, id: String(me.id) };
}

export const PHONES = [
  { name: "844×390", width: 844, height: 390 },
  { name: "932×430", width: 932, height: 430 },
  { name: "667×375 (iPhone SE)", width: 667, height: 375 },
];

/** A landscape phone: touch, small screen (the app's phone layout keys on the height). */
export const phone = (size: { width: number; height: number }): BrowserContextOptions => ({ viewport: size, isMobile: true, hasTouch: true });

export type Misfit = { what: string; box: [number, number, number, number] };

/**
 * Elements matching `selector` that are shown (not inert, not hidden, not in a closed drawer)
 * and stick out of the viewport by more than a pixel. `horizontalOnly`: pages that scroll down
 * only have to fit sideways.
 */
export async function outOfView(page: Page, selector: string, horizontalOnly = false): Promise<Misfit[]> {
  return page.evaluate(
    ([sel, sideways]) => {
      const vw = document.documentElement.clientWidth;
      const vh = window.innerHeight;
      const out: { what: string; box: [number, number, number, number] }[] = [];
      for (const el of Array.from(document.querySelectorAll<HTMLElement>(sel as string))) {
        if (el.closest("[inert], [aria-hidden=true], .sr-only")) continue;
        const style = getComputedStyle(el);
        if (style.visibility === "hidden" || style.display === "none" || Number(style.opacity) === 0) continue;
        let r = el.getBoundingClientRect();
        if (r.width === 0 || r.height === 0) continue;
        // inside a box that scrolls (a long sheet): that box has to fit, the element scrolls into it
        for (let up = el.parentElement; up && up !== document.body; up = up.parentElement) {
          const s = getComputedStyle(up);
          if (/(auto|scroll)/.test(s.overflowY) && up.scrollHeight > up.clientHeight + 1) {
            const box = up.getBoundingClientRect();
            r = new DOMRect(r.left, Math.max(r.top, box.top), r.width, Math.max(0, Math.min(r.bottom, box.bottom) - Math.max(r.top, box.top)));
            break;
          }
        }
        const sx = window.scrollX;
        const sy = window.scrollY;
        const left = r.left + sx;
        const right = r.right + sx;
        const top = r.top + (sideways ? sy : 0);
        const bottom = r.bottom + (sideways ? sy : 0);
        const bad = left < -1 || right > vw + 1 || (!sideways && (top < -1 || bottom > vh + 1));
        if (bad) {
          const name = el.getAttribute("aria-label") ?? el.textContent?.trim().slice(0, 30) ?? "";
          out.push({ what: `${el.tagName.toLowerCase()}.${String(el.className).split(" ").slice(0, 2).join(".")} "${name}"`, box: [Math.round(left), Math.round(top), Math.round(right), Math.round(bottom)] });
        }
      }
      return out;
    },
    [selector, horizontalOnly] as const,
  );
}

/** The page is no wider than the screen (no sideways scrolling). */
export async function pageWidth(page: Page) {
  return page.evaluate(() => ({ scroll: document.documentElement.scrollWidth, view: document.documentElement.clientWidth }));
}

/**
 * Controls whose tap area is under `min` px across or down. The tap area is measured by hit
 * testing from the control's centre outwards, so invisible ::before extensions count and a
 * neighbour on top of it does not.
 */
export async function smallTargets(page: Page, min = 44): Promise<Misfit[]> {
  return page.evaluate((need) => {
    const out: { what: string; box: [number, number, number, number] }[] = [];
    const sel = "button, a[href], input:not([type=hidden]), select, textarea, [role=button], [role=switch], [role=radio], [role=tab], [tabindex='0']";
    const vw = document.documentElement.clientWidth;
    const vh = window.innerHeight;
    for (const el of Array.from(document.querySelectorAll<HTMLElement>(sel))) {
      if (el.closest("[inert], [aria-hidden=true]")) continue;
      if ((el as HTMLButtonElement).disabled) continue;
      const style = getComputedStyle(el);
      if (style.visibility === "hidden" || style.display === "none" || style.pointerEvents === "none") continue;
      if (el.getBoundingClientRect().width === 0) continue;
      el.scrollIntoView({ block: "center", inline: "nearest" }); // half hidden at the edge of a scrolling page or sheet
      const r = el.getBoundingClientRect();
      if (r.width === 0 || r.height === 0) continue;
      const cx = r.left + r.width / 2;
      const cy = r.top + r.height / 2;
      if (cx < 0 || cy < 0 || cx > vw || cy > vh) continue; // off screen (scrolled away)
      const hits = (x: number, y: number) => {
        if (x < 0 || y < 0 || x >= vw || y >= vh) return false;
        const at = document.elementFromPoint(x, y);
        return !!at && (at === el || el.contains(at));
      };
      if (!hits(cx, cy)) continue; // covered (an open dialog over the page)
      const reach = (dx: number, dy: number) => {
        let n = 0;
        while (n < 80 && hits(cx + dx * (n + 1), cy + dy * (n + 1))) n++;
        return n;
      };
      const w = reach(-1, 0) + reach(1, 0) + 1;
      const h = reach(0, -1) + reach(0, 1) + 1;
      if (w < need - 1 || h < need - 1) {
        const name = el.getAttribute("aria-label") ?? el.textContent?.trim().slice(0, 30) ?? "";
        out.push({ what: `${el.tagName.toLowerCase()}.${String(el.className).split(" ").slice(0, 2).join(".")} "${name}" ${w}×${h}`, box: [Math.round(r.left), Math.round(r.top), Math.round(r.right), Math.round(r.bottom)] });
      }
    }
    return out;
  }, min);
}
