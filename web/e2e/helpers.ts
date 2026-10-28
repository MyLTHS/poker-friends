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
 * and stick out of the viewport by more than a pixel, or are cut by a parent that hides its
 * overflow (a seat half under the column next to it). `horizontalOnly`: pages that scroll down
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
        const label = () => `${el.tagName.toLowerCase()}.${String(el.className).split(" ").slice(0, 2).join(".")} "${el.getAttribute("aria-label") ?? el.textContent?.trim().slice(0, 30) ?? ""}"`;
        let clippedBy: string | null = null;
        for (let up = el.parentElement; up && up !== document.body; up = up.parentElement) {
          const s = getComputedStyle(up);
          const box = up.getBoundingClientRect();
          // inside a box that scrolls (a long sheet): that box has to fit, the element scrolls into it
          if (/(auto|scroll)/.test(s.overflowY) && up.scrollHeight > up.clientHeight + 1) {
            r = new DOMRect(r.left, Math.max(r.top, box.top), r.width, Math.max(0, Math.min(r.bottom, box.bottom) - Math.max(r.top, box.top)));
            break;
          }
          const cutX = /(hidden|clip)/.test(s.overflowX) && (r.left < box.left - 1 || r.right > box.right + 1);
          const cutY = /(hidden|clip)/.test(s.overflowY) && (r.top < box.top - 1 || r.bottom > box.bottom + 1);
          if (cutX || cutY) {
            clippedBy = `${up.tagName.toLowerCase()}.${String(up.className).split(" ").slice(0, 2).join(".")}`;
            break;
          }
        }
        if (clippedBy) {
          out.push({ what: `${label()} cut by ${clippedBy}`, box: [Math.round(r.left), Math.round(r.top), Math.round(r.right), Math.round(r.bottom)] });
          continue;
        }
        const sx = window.scrollX;
        const sy = window.scrollY;
        const left = r.left + sx;
        const right = r.right + sx;
        const top = r.top + (sideways ? sy : 0);
        const bottom = r.bottom + (sideways ? sy : 0);
        const bad = left < -1 || right > vw + 1 || (!sideways && (top < -1 || bottom > vh + 1));
        if (bad) out.push({ what: label(), box: [Math.round(left), Math.round(top), Math.round(right), Math.round(bottom)] });
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
 * Controls whose tap area is under `min` px across or down, or that something else covers. The
 * tap area is measured by hit testing from the control's centre outwards, so invisible ::before
 * extensions count and a neighbour lying over it does not. Controls behind a dialog, a drawer
 * or a scrim are skipped: they cannot be tapped and are not meant to be.
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
      // a link inside a sentence ("… · đổi tài khoản"): exempt from target size (WCAG 2.5.8)
      if (el.tagName === "A" && style.display === "inline") continue;
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
      if (!hits(cx, cy)) {
        const top = document.elementFromPoint(cx, cy);
        const modal = document.querySelector("dialog:modal");
        if (modal && !modal.contains(el)) continue; // the page behind a modal dialog
        const overlay = top?.closest("[role=dialog], dialog, .scrim");
        if (overlay && !overlay.contains(el)) continue; // behind an open drawer, sheet or its scrim
        const by = top ? `${top.tagName.toLowerCase()}.${String(top.className).split(" ").slice(0, 2).join(".")}` : "nothing";
        const name = el.getAttribute("aria-label") ?? el.textContent?.trim().slice(0, 30) ?? "";
        out.push({ what: `${el.tagName.toLowerCase()}.${String(el.className).split(" ").slice(0, 2).join(".")} "${name}" covered by ${by}`, box: [Math.round(r.left), Math.round(r.top), Math.round(r.right), Math.round(r.bottom)] });
        continue;
      }
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

/* ---------- playing a turn with the keyboard ---------- */

export type Applied = { seat: number; kind: string; amount: number; timeout?: boolean };

/** Every action.applied the page's table socket receives, in order (attach before opening the table). */
export function watchActions(page: Page): Applied[] {
  const seen: Applied[] = [];
  page.on("websocket", (ws) =>
    ws.on("framereceived", ({ payload }) => {
      try {
        const message = JSON.parse(String(payload));
        if (message.type === "action.applied") seen.push(message.payload.action);
      } catch {
        // not JSON: not ours
      }
    }),
  );
  return seen;
}

export const turnBar = (page: Page) => page.getByRole("region", { name: "Tới lượt bạn" });

/** The page shows my turn and is ready for a key: no command waiting for its ack, buttons on. */
export async function readyToAct(page: Page): Promise<boolean> {
  if ((await turnBar(page).count()) === 0) return false;
  if ((await page.locator("[data-hand][data-pending]").count()) > 0) return false;
  const call = turnBar(page).locator(".act-call");
  return (await call.count()) > 0 && (await call.isEnabled());
}

/**
 * Check or call with the C key, and wait for the server to apply exactly that action for `seat`.
 * The bar's key listener is attached just after it renders; a press that lands before it is
 * lost (nothing goes pending), so it is pressed again until something is sent.
 */
export async function checkOrCallWithKey(page: Page, seen: Applied[], seat: number) {
  await expect.poll(() => readyToAct(page), { timeout: 20_000 }).toBe(true);
  const before = seen.filter((a) => a.seat === seat).length;
  await expect
    .poll(
      async () => {
        const sent = (await page.locator("[data-hand][data-pending]").count()) > 0 || seen.filter((a) => a.seat === seat).length > before;
        if (!sent && (await readyToAct(page))) await page.keyboard.press("c");
        return sent;
      },
      { timeout: 15_000, intervals: [400] },
    )
    .toBe(true);
  await expect.poll(() => seen.filter((a) => a.seat === seat).length).toBe(before + 1);
  const mine = seen.filter((a) => a.seat === seat).at(-1)!;
  expect(["check", "call"]).toContain(mine.kind);
  expect(mine.timeout ?? false).toBe(false);
  await expect(page.locator("[data-hand][data-pending]")).toHaveCount(0);
}

/** Waits until no finite animation or transition is running (entrances, drawers, dialogs). */
export async function settled(page: Page) {
  await page.waitForFunction(() =>
    document.getAnimations().every((a) => a.playState !== "running" || a.effect?.getComputedTiming().iterations === Infinity),
  );
}
