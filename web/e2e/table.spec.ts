// The D1 table on the real server (B4b, redone for C3): two players and a spectator, each in their
// own browser context, play one hand through the real table page. Binh plays on a landscape phone
// with reduced motion; An's socket is dropped once to check the reconnect overlay and that a
// snapshot never replays an animation.

import { expect, test, type Browser, type BrowserContext, type Page, type WebSocketRoute } from "@playwright/test";

const WEB = "http://localhost:3100";

type Player = { name: string; context: BrowserContext; page: Page; id: string };

async function api(page: Page, method: string, path: string, data?: unknown) {
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

type Options = Parameters<Browser["newContext"]>[0];

/** A fresh browser (own cookies) logged in as a new guest. */
async function newPlayer(browser: Browser, name: string, options: Options = {}): Promise<Player> {
  const context = await browser.newContext(options);
  const page = await context.newPage();
  await api(page, "GET", "/api/auth/config/"); // csrftoken cookie
  const me = await api(page, "POST", "/api/auth/guest/", { username: name });
  return { name, context, page, id: String(me.id) };
}

/** The table area carries the page's state for tests (TableScreen `probe`). */
const area = (page: Page) => page.locator("[data-hand]");

/** Labels of my own two cards ("Bài úp" would be a card back). */
async function myCards(page: Page): Promise<string[]> {
  const cards = page.locator(".me .me-cards [role=img]");
  await expect(cards).toHaveCount(2);
  return cards.evaluateAll((nodes) => nodes.map((n) => n.getAttribute("aria-label") ?? ""));
}

/** Face-up hole cards anywhere on the seats (the board is not a seat). */
async function faceUpLabels(page: Page): Promise<string[]> {
  return page
    .locator(".seat [role=img], .me [role=img]")
    .evaluateAll((nodes) => nodes.map((n) => n.getAttribute("aria-label") ?? "").filter((l) => l && l !== "Bài úp"));
}

/** Seat name -> stack, as this page shows them. */
async function stacks(page: Page): Promise<Record<string, number>> {
  const rows = await page.locator(".seat:not(.seat-empty), .me").evaluateAll((nodes) =>
    nodes.map((n) => {
      const name = n.querySelector(".seat-plate b, .me-id b")?.firstChild?.textContent?.trim() ?? "";
      const stack = n.querySelector(".stack")?.textContent ?? "";
      return [name, Number(stack.replace(/\D/g, ""))] as const;
    }),
  );
  return Object.fromEntries(rows);
}

/** Take this player's turn if it is theirs: check when free, else call. Returns true if acted. */
async function act(player: Player, doubleClick: boolean): Promise<boolean> {
  const check = player.page.getByRole("button", { name: "Check", exact: true });
  const call = player.page.getByRole("button", { name: /^Theo/ });
  let button = null;
  if ((await check.count()) && (await check.isEnabled())) button = check;
  else if ((await call.count()) && (await call.isEnabled())) button = call;
  if (!button) return false;
  const before = Number(await area(player.page).getAttribute("data-version"));
  if (doubleClick) await button.dblclick();
  else await button.click();
  // Wait until the server has taken it: a newer state, and no command waiting for its ack.
  await expect.poll(async () => Number(await area(player.page).getAttribute("data-version"))).toBeGreaterThan(before);
  await expect(area(player.page)).not.toHaveAttribute("data-pending");
  return true;
}

test("two players and a spectator play one hand; nobody sees hidden cards", async ({ browser }) => {
  const an = await newPlayer(browser, "An");
  const binh = await newPlayer(browser, "Binh", { viewport: { width: 844, height: 390 }, hasTouch: true, reducedMotion: "reduce" });
  const chi = await newPlayer(browser, "Chi"); // watches only

  // An's socket goes through a proxy we can cut (reconnect check at the end).
  let anSocket: WebSocketRoute | null = null;
  let cut = false;
  await an.page.routeWebSocket(/\/ws\/rooms\//, (ws) => {
    if (cut) return void ws.close({ code: 1006, reason: "test" });
    anSocket = ws;
    ws.connectToServer();
  });

  const created = await api(an.page, "POST", "/api/rooms/", {
    name: "Bàn E2E",
    small_blind: 5,
    big_blind: 10,
    think_time_seconds: 60,
  });
  const roomId = created.room.room_id;
  await api(an.page, "POST", `/api/rooms/${roomId}/seats/`, { seat: 1 });
  await api(binh.page, "POST", `/api/rooms/${roomId}/seats/`, { seat: 2 });
  for (const player of [an, binh]) {
    await api(an.page, "POST", `/api/rooms/${roomId}/chips/`, { player_id: player.id, amount: 1000 });
  }

  for (const player of [an, binh, chi]) {
    await player.page.goto(`/rooms/${roomId}/table`);
    await expect(area(player.page)).toHaveAttribute("data-hand", "live");
  }
  // The phone draws the landscape layout (right column), the spectator has no seat of their own.
  await expect(binh.page.locator(".tbl-mobile .ppanel")).toBeVisible();
  await expect(chi.page.locator(".me")).toHaveCount(0);
  await expect(chi.page.getByText("Bạn đang xem")).toBeVisible();

  // Each player sees their own two cards and never the other's; the spectator sees none.
  const anCards = await myCards(an.page);
  const binhCards = await myCards(binh.page);
  expect(await faceUpLabels(binh.page)).toEqual(binhCards);
  expect(await faceUpLabels(an.page)).toEqual(anCards);
  expect(await faceUpLabels(chi.page)).toEqual([]);

  // Chat goes through the table socket, spectators included.
  await chi.page.getByRole("textbox", { name: "Tin nhắn" }).fill("chúc may mắn");
  await chi.page.getByRole("textbox", { name: "Tin nhắn" }).press("Enter");
  await expect(an.page.locator(".chat").getByText("chúc may mắn")).toBeVisible();

  // Play: check or call every turn until the hand ends. The first action is a double click,
  // which must be applied once (one command_id, docs/api/ws-protocol.md mục 5).
  let actions = 0;
  for (let round = 0; round < 40; round++) {
    for (const player of [an, binh]) {
      if (await act(player, actions === 0)) actions++;
    }
    if ((await area(an.page).getAttribute("data-hand")) === "complete") break;
    await an.page.waitForTimeout(250);
  }
  for (const player of [an, binh, chi]) await expect(area(player.page)).toHaveAttribute("data-hand", "complete");

  // Every page agrees on the stacks (read before the next hand starts, 4 s later), and the
  // chips granted are all still there.
  const seen = await stacks(an.page);
  expect(await stacks(binh.page)).toEqual(seen);
  expect(await stacks(chi.page)).toEqual(seen);
  expect(Object.values(seen).reduce((a, b) => a + b, 0)).toBe(2000);

  // The server applied exactly the actions taken: the double click counted once.
  const hands = await api(chi.page, "GET", `/api/rooms/${roomId}/hands/`);
  expect(hands.hands).toHaveLength(1);
  const replay = await api(chi.page, "GET", `/api/hands/${hands.hands[0].hand_id}/replay/`);
  expect(replay.steps.length - 1).toBe(actions);
  const net = Object.fromEntries(hands.hands[0].players.map((p: { display_name: string; net: number }) => [p.display_name, p.net]));
  expect(seen).toEqual({ An: 1000 + net.An, Binh: 1000 + net.Binh });

  // Lost connection: the overlay shows and the bar locks; back online, the page jumps to the
  // server's state without replaying any animation (no card is flying in).
  await expect(area(an.page)).toHaveAttribute("data-hand", "live", { timeout: 15_000 });
  cut = true;
  anSocket!.close({ code: 1006, reason: "test" });
  await expect(an.page.getByText("Đang kết nối lại…")).toBeVisible();
  cut = false;
  // Retries run on their own too: "Thử lại ngay" only skips the wait if one is pending.
  await an.page.getByRole("button", { name: "Thử lại ngay" }).click({ timeout: 3000 }).catch(() => {});
  await expect(an.page.getByText("Đang kết nối lại…")).toBeHidden();
  const flying = await an.page.locator(".stage").evaluate((stage) => stage.getAnimations({ subtree: true }).filter((a) => !(a instanceof CSSAnimation || a instanceof CSSTransition)).length);
  expect(flying).toBe(0);

  // The replay of the hand opens on the D1 stage and steps forward.
  await chi.page.goto(`/hands/${hands.hands[0].hand_id}`);
  await expect(chi.page.locator(".rp-step")).toContainText(`1/${replay.steps.length}`);
  await chi.page.getByRole("button", { name: "Bước sau" }).click();
  await expect(chi.page.locator(".rp-step")).toContainText(`2/${replay.steps.length}`);

  for (const player of [an, binh, chi]) await player.context.close();
});
