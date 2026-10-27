// B4b: two players and a spectator, each in their own browser context, play one hand on the
// real server through the real table page (docs/roadmap.md, B4).

import { expect, test, type Browser, type BrowserContext, type Page } from "@playwright/test";

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

/** A fresh browser (own cookies) logged in as a new guest. */
async function newPlayer(browser: Browser, name: string): Promise<Player> {
  const context = await browser.newContext();
  const page = await context.newPage();
  await api(page, "GET", "/api/auth/config/"); // csrftoken cookie
  const me = await api(page, "POST", "/api/auth/guest/", { username: name });
  return { name, context, page, id: String(me.id) };
}

/** Labels of the face-up cards in front of the viewer ("Bài úp" is a card back). */
async function heroCards(page: Page): Promise<string[]> {
  const cards = page.locator(".seat-hero .playing-card");
  await expect(cards).toHaveCount(2);
  return cards.evaluateAll((nodes) => nodes.map((n) => n.getAttribute("aria-label") ?? ""));
}

async function faceUpLabels(page: Page): Promise<string[]> {
  return page
    .locator(".seat .playing-card")
    .evaluateAll((nodes) => nodes.map((n) => n.getAttribute("aria-label") ?? "").filter((l) => l !== "Bài úp"));
}

/** Seat name -> stack, as this page shows them. */
async function stacks(page: Page): Promise<Record<string, number>> {
  const rows = await page.locator(".seat:not(.seat-empty) .seat-info").evaluateAll((nodes) =>
    nodes.map((n) => [n.querySelector("strong")?.textContent ?? "", n.textContent ?? ""]),
  );
  return Object.fromEntries(rows.map(([name, text]) => [name, Number(text.slice(name.length).replace(/\D/g, ""))]));
}

/** Take this player's turn if it is theirs: check when free, else call. Returns true if acted. */
async function act(player: Player, doubleClick: boolean): Promise<boolean> {
  const fold = player.page.getByRole("button", { name: "BỎ BÀI" });
  const check = player.page.getByRole("button", { name: "CHECK" });
  const call = player.page.getByRole("button", { name: /^THEO/ });
  let button = null;
  if ((await check.count()) && (await check.isEnabled())) button = check;
  else if ((await call.count()) && (await call.isEnabled())) button = call;
  if (!button) return false;
  if (doubleClick) await button.dblclick();
  else await button.click();
  // Wait until the server has taken it: the bar goes idle while it is not this player's turn.
  await expect(fold).toBeDisabled();
  return true;
}

test("two players and a spectator play one hand; nobody sees hidden cards", async ({ browser }) => {
  const an = await newPlayer(browser, "An");
  const binh = await newPlayer(browser, "Binh");
  const chi = await newPlayer(browser, "Chi"); // watches only

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
    await expect(player.page.getByText("Đã kết nối")).toBeVisible();
  }
  await expect(chi.page.getByText("Đang xem", { exact: true })).toBeVisible();

  // Each player sees their own two cards and never the other's; the spectator sees none.
  const anCards = await heroCards(an.page);
  const binhCards = await heroCards(binh.page);
  expect(await faceUpLabels(binh.page)).toEqual(binhCards);
  expect(await faceUpLabels(an.page)).toEqual(anCards);
  expect(await faceUpLabels(chi.page)).toEqual([]);

  // Play: check or call every turn until the hand ends. The first action is a double click,
  // which must be applied once (one command_id, docs/api/ws-protocol.md mục 5).
  let actions = 0;
  for (let round = 0; round < 40; round++) {
    for (const player of [an, binh]) {
      if (await act(player, actions === 0)) actions++;
    }
    if (await an.page.getByText(/Ván trước:/).isVisible()) break;
    await an.page.waitForTimeout(250);
  }
  await expect(an.page.getByText(/Ván trước:/)).toBeVisible();
  await expect(binh.page.getByText(/Ván trước:/)).toBeVisible();

  // Every page agrees on the stacks, and the chips granted are all still there.
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

  for (const player of [an, binh, chi]) await player.context.close();
});
